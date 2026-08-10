-- Recommendation accuracy round 2, step 2: title-level negative feedback.
-- The engine already rewards a candidate for being embedding-close to
-- something a user loved (see CONTENT_MATCH_THRESHOLD + the citation logic
-- in engine.ts, and most_similar_liked_title, migration 0016) -- this is
-- the missing negative counterpart. Genre-affinity (migration/task #115)
-- already suppresses whole genres a user rates low, but that's genre-level;
-- a specific disliked film should also suppress its close neighbors even
-- inside a genre the user otherwise likes overall (e.g. one hated slasher
-- shouldn't just dock "horror" broadly, it should specifically dampen
-- other slashers close to IT).
--
-- For each candidate title, returns how close it is to the single most
-- similar title the user rated <= p_dislike_max_score -- the engine
-- applies a soft penalty scaled by this (see dislike-penalty.ts), not a
-- hard exclusion, consistent with every other adjustment in engine.ts.
create or replace function public.similarity_to_disliked_titles(
  p_user_id uuid,
  p_title_ids uuid[],
  p_dislike_max_score numeric default 2.5
)
returns table (
  title_id uuid,
  max_similarity float
)
language plpgsql
stable
as $$
begin
  return query
  with disliked as (
    select te.embedding
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    where r.user_id = p_user_id and r.score <= p_dislike_max_score
  ),
  candidates as (
    select te.title_id, te.embedding
    from public.title_embeddings te
    where te.title_id = any(p_title_ids)
  )
  select c.title_id, coalesce(max(1 - (c.embedding <=> d.embedding)), 0)::float as max_similarity
  from candidates c
  left join disliked d on true
  group by c.title_id;
end;
$$;
