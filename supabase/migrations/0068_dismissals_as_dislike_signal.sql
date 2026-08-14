-- Discover swipe deck passes ("this isn't for me") were only ever a hard
-- exclusion of that exact title (title_dismissals -> filtered out of the
-- candidate pool in engine.ts, migration 0066) -- unlike an explicit low
-- rating, a pass never dampened *similar* titles the way
-- similarity_to_disliked_titles/dislike-penalty.ts already does for
-- ratings <= 2.5. Passing on five slashers in a row still let a sixth
-- slasher rank normally as long as it wasn't one of those exact five.
--
-- This folds title_dismissals into the same "disliked" embedding set the
-- function already builds from low ratings -- a swipe-left is weaker
-- signal than a considered 1-star rating (no explicit score attached,
-- could be "seen it" as much as "hated it"), but it's still real
-- behavior, and the existing soft-penalty curve in dislike-penalty.ts
-- (linear up to MAX_DISLIKE_PENALTY, only above CONTENT_MATCH_THRESHOLD)
-- already treats this as a nudge rather than a veto, so no separate
-- weighting is needed for the weaker signal -- it's summed in exactly the
-- same way a rated dislike would be.
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
    union
    select te.embedding
    from public.title_dismissals d
    join public.title_embeddings te on te.title_id = d.title_id
    where d.user_id = p_user_id
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
