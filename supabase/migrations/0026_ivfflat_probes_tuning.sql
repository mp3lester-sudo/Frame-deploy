-- match_titles_for_user (0023) does an ANN nearest-neighbor search against
-- title_embeddings' ivfflat index (lists = 100, see 0001_init.sql). ivfflat
-- defaults to probes = 1, meaning it only checks 1 of the 100 list clusters
-- per query — at ~36k embedded titles that's a real recall risk: a title
-- that's actually the best cosine match can simply fall in a cluster the
-- index never probes, so it never even reaches the p_match_count candidate
-- pool engine.ts scores against.
--
-- First attempt used `set ivfflat.probes = 10` as a CREATE FUNCTION option
-- (identical to how `set search_path = public` is set two lines below) —
-- that failed on Supabase with "permission denied to set parameter
-- ivfflat.probes", because Supabase's managed Postgres restricts the
-- ALTER-FUNCTION-level SET clause for extension-defined GUCs even when the
-- GUC itself (ivfflat.probes is PGC_USERSET) would normally allow any role
-- to set it at the session level. The fix: set it at RUNTIME inside the
-- function body via set_config(..., true) — the `true` (is_local) scopes it
-- to just this transaction, which for an RPC call is just this one query,
-- so it never leaks into any other call on the connection.
create or replace function public.match_titles_for_user(
  p_user_id uuid,
  p_match_count int default 20,
  p_exclude_watched boolean default true
)
returns table (
  title_id uuid,
  similarity float
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('ivfflat.probes', '10', true);

  return query
  select
    te.title_id,
    1 - (te.embedding <=> tv.embedding) as similarity
  from public.title_embeddings te
  cross join public.taste_vectors tv
  where tv.user_id = p_user_id
    and (
      not p_exclude_watched
      or not exists (
        select 1 from public.watch_history wh
        where wh.user_id = p_user_id and wh.title_id = te.title_id
      )
    )
  order by te.embedding <=> tv.embedding asc
  limit p_match_count;
end;
$$;
