-- Real behavioral collaborative filtering: "people who rated the SAME
-- titles you rated highly also loved these" -- computed directly from the
-- ratings matrix, with no embeddings involved anywhere in the query.
--
-- similar_users_liked (migrations 0003/0021/0022) already does a form of
-- collaborative filtering, but its notion of a "similar user" comes from
-- taste_vector embedding proximity -- i.e. it's mediated entirely through
-- content embeddings, the same signal match_titles_for_user already uses
-- for content matching. That means it can only ever surface titles that
-- are already reachable through semantic/thematic closeness. It
-- structurally cannot catch the classic collaborative-filtering win: two
-- titles with zero thematic resemblance to each other that the same
-- cohort of real people both happen to love. That correlation only lives
-- in the ratings data itself.
--
-- This function finds "taste twins" purely from shared high ratings (score
-- >= 4 on the same titles), weighted Jaccard-style so a twin whose
-- overlap is a large share of both users' liked titles counts for more
-- than a prolific rater who happens to share a few blockbusters among
-- hundreds of unrelated ratings. Then it surfaces what those twins loved
-- that this user hasn't seen yet.
--
-- security definer for the same reason as similar_users_liked (migration
-- 0022's lesson applied from the start this time): this inherently needs
-- to read OTHER users' ratings, which RLS would otherwise block for any
-- real signed-in caller.
create index if not exists ratings_title_id_liked_idx
  on public.ratings (title_id)
  where score >= 4.0;

create or replace function public.behavioral_collaborative_recs(
  p_user_id uuid,
  p_match_count int default 20,
  p_min_shared_likes int default 2
)
returns table (
  title_id uuid,
  score float
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with my_likes as (
    select r.title_id from public.ratings r where r.user_id = p_user_id and r.score >= 4.0
  ),
  my_like_count as (
    select count(*) as n from my_likes
  ),
  twins as (
    -- Other users who rated at least p_min_shared_likes of the same
    -- titles >= 4 -- real overlap in the ratings matrix, not proximity in
    -- embedding space.
    select
      r.user_id,
      count(*) as shared_likes,
      (select count(*) from public.ratings r2 where r2.user_id = r.user_id and r2.score >= 4.0) as their_like_count
    from public.ratings r
    join my_likes ml on ml.title_id = r.title_id
    where r.user_id <> p_user_id and r.score >= 4.0
    group by r.user_id
    having count(*) >= p_min_shared_likes
  ),
  weighted_twins as (
    -- Jaccard overlap (shared / union) rather than a raw shared-count or a
    -- similarity mediated by any embedding -- rewards twins whose liked
    -- titles substantially overlap with this user's, not just prolific
    -- raters who happen to have rated a few of the same titles among
    -- hundreds of unrelated ones.
    select
      t.user_id,
      t.shared_likes::float / greatest(1, (select n from my_like_count) + t.their_like_count - t.shared_likes) as closeness
    from twins t
  )
  select r.title_id, avg((r.score / 5.0) * wt.closeness) as score
  from public.ratings r
  join weighted_twins wt on wt.user_id = r.user_id
  where r.score >= 4.0
    and r.title_id not in (select title_id from my_likes)
    and not exists (
      select 1 from public.watch_history wh
      where wh.user_id = p_user_id and wh.title_id = r.title_id
    )
  group by r.title_id
  order by score desc
  limit p_match_count;
end;
$$;
