-- Discovery-depth audit rendition #1: "More like this" rail on the
-- movie/show detail page. Every title-similarity RPC that exists so far
-- (most_similar_liked_title, match_titles_for_user) is anchored to a
-- *user* -- taste vector or rating history. This is the first purely
-- title-to-title variant: given one title, find other titles whose
-- embedding is closest to it, full stop. No user context needed, so it
-- works for logged-out visitors too.
--
-- Same ANN-index-forcing pattern as match_titles_for_user (see migrations
-- 0080/0081) -- the planner under-costs the ivfflat index on this
-- project's compute tier and picks a sequential scan without the nudge.
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

  select embedding into v_embedding from public.title_embeddings where title_id = p_title_id;
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
