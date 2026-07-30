-- match_titles_for_user (0023) does an ANN nearest-neighbor search against
-- title_embeddings' ivfflat index (lists = 100, see 0001_init.sql). ivfflat
-- defaults to probes = 1, meaning it only checks 1 of the 100 list clusters
-- per query — at ~36k embedded titles that's a real recall risk: a title
-- that's actually the best cosine match can simply fall in a cluster the
-- index never probes, so it never even reaches the p_match_count candidate
-- pool engine.ts scores against. No amount of downstream tuning (quality
-- weighting, genre affinity, etc.) can fix a good match that was silently
-- excluded before scoring even started.
--
-- `set ivfflat.probes = 10` on the function checks 10 of the 100 clusters
-- (10x the default recall) for the duration of this function's calls only —
-- doesn't touch the global/session default, so nothing else is affected.
-- Everything else is identical to 0023's definition.
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
set ivfflat.probes = 10
as $$
begin
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
