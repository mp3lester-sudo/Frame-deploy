-- Fix migration 0086's similar_titles RPC: live-verifying task #746 found
-- every call failing with Postgres error 42702 "column reference title_id
-- is ambiguous" (confirmed via Vercel runtime logs on the deployed app).
--
-- Root cause: the function's very first statement --
--   select embedding into v_embedding from public.title_embeddings
--   where title_id = p_title_id;
-- -- references `title_id` unqualified. Since the function is declared
-- `returns table (title_id uuid, similarity float)`, plpgsql exposes
-- `title_id` as an OUT-parameter variable in scope for the whole function
-- body, so this bare reference collides with the title_embeddings.title_id
-- column. Every other query in the function already qualifies its
-- title_id references via an alias (te.title_id, n.title_id) -- this one
-- line was the only unqualified holdout.
create or replace function public.similar_titles(
  p_title_id uuid,
  p_match_count int default 8,
  p_media_type text default 'movie'
)
returns table (
  title_id uuid,
  similarity float
)
language plpgsql
stable
as $$
declare
  v_embedding vector(1536);
begin
  perform set_config('ivfflat.probes', '10', true);
  perform set_config('enable_seqscan', 'off', true);

  select te.embedding into v_embedding
  from public.title_embeddings te
  where te.title_id = p_title_id;

  if v_embedding is null then
    return;
  end if;

  return query
  with nearest as materialized (
    select te.title_id, te.embedding <=> v_embedding as dist
    from public.title_embeddings te
    where te.title_id <> p_title_id
    order by te.embedding <=> v_embedding asc
    limit greatest(p_match_count * 10, 200)
  )
  select n.title_id, 1 - n.dist as similarity
  from nearest n
  join public.titles t on t.id = n.title_id
  where t.type = p_media_type
  order by n.dist asc
  limit p_match_count;
end;
$$;
