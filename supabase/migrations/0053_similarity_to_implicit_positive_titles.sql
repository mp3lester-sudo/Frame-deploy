-- Recommendation accuracy round 2, step 3 (positive half): implicit
-- signals. Only explicit ratings feed the taste vector today --
-- watchlist adds (real "I want to watch this" intent) and watch_history
-- rows with no rating attached (watched but never rated) sit completely
-- unused as signal, even though both are genuine behavior.
--
-- Deliberately NOT folded into taste_vectors the way ratings are (via
-- upsert_taste_vector_from_rating) -- recompute_taste_vector_for_user
-- (migration 0031/0049) rebuilds the vector strictly from ratings >= 4,
-- so anything written into the vector by a different path would be
-- silently wiped out the next time that recompute runs (e.g. on
-- unrateTitle). Keeping this as its own similarity signal, blended in
-- engine.ts the same "sum of deltas" way as everything else (context,
-- weather, quality, genre-affinity, and the disliked-title penalty from
-- migration 0052), avoids that desync entirely and mirrors the existing
-- positive/negative pattern: similarity_to_disliked_titles penalizes,
-- this rewards.
--
-- Source set is watchlist ∪ (watched but unrated) -- a title already
-- rated shouldn't double-count here, it's already driving the real taste
-- vector.
create or replace function public.similarity_to_implicit_positive_titles(
  p_user_id uuid,
  p_title_ids uuid[]
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
  with implicit_positive as (
    select te.embedding
    from public.watchlist w
    join public.title_embeddings te on te.title_id = w.title_id
    where w.user_id = p_user_id
    union
    select te.embedding
    from public.watch_history wh
    join public.title_embeddings te on te.title_id = wh.title_id
    where wh.user_id = p_user_id
      and not exists (
        select 1 from public.ratings r
        where r.user_id = wh.user_id and r.title_id = wh.title_id
      )
  ),
  candidates as (
    select te.title_id, te.embedding
    from public.title_embeddings te
    where te.title_id = any(p_title_ids)
  )
  select c.title_id, coalesce(max(1 - (c.embedding <=> ip.embedding)), 0)::float as max_similarity
  from candidates c
  left join implicit_positive ip on true
  group by c.title_id;
end;
$$;
