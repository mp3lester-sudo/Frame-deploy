-- similar_users_liked (migration 0003) summed (rating/5 * closeness) across
-- every taste-similar neighbor who rated a title >= 4. That means a title
-- liked by five so-so-close neighbors could out-score one liked by a
-- single very-close neighbor — the "collaborative" signal was really
-- measuring how many similar people happened to rate something, not how
-- well it matches you specifically. That's a popularity-among-neighbors
-- bias, not a match-quality signal, and it's part of why the home page's
-- blended match score (src/lib/recommendations/engine.ts) could land a
-- genuinely good pick in an unconvincing-looking range.
--
-- Switching sum() to avg() makes this a true average affinity instead:
-- bounded to [0, 1] like the content-similarity term it's blended with
-- (rating/5 <= 1, closeness <= 1, so their product is <= 1, and an average
-- of values <= 1 is <= 1), and no longer inflated by neighbor count.
create or replace function public.similar_users_liked(
  p_user_id uuid,
  p_match_count int default 20
)
returns table (
  title_id uuid,
  score float
)
language plpgsql
stable
as $$
begin
  return query
  with target as (
    select embedding from public.taste_vectors where user_id = p_user_id
  ),
  neighbors as (
    select tv.user_id, 1 - (tv.embedding <=> target.embedding) as closeness
    from public.taste_vectors tv, target
    where tv.user_id <> p_user_id
    order by tv.embedding <=> target.embedding asc
    limit 200
  )
  select r.title_id, avg((r.score / 5.0) * n.closeness) as score
  from public.ratings r
  join neighbors n on n.user_id = r.user_id
  where r.score >= 4.0
    and not exists (
      select 1 from public.watch_history wh
      where wh.user_id = p_user_id and wh.title_id = r.title_id
    )
  group by r.title_id
  order by score desc
  limit p_match_count;
end;
$$;
