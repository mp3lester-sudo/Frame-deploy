-- Recommendation intelligence audit finding #5: match_titles_for_user,
-- similarity_to_disliked_titles, similarity_to_implicit_positive_titles,
-- and most_similar_liked_titles_batch (engine.ts) all silently degrade
-- past their timeout -- correct behavior for never blocking a page render,
-- but until now there was no record ANYWHERE that a degradation happened,
-- only that a request completed. That blind spot is exactly how a real
-- live bug (a 512-rating account silently getting served cold-start
-- popularity picks -- see the recommendation-intelligence-audit.md
-- writeup, finding #1) went unnoticed: nothing distinguished "genuinely
-- no taste vector" from "vector exists but something upstream degraded."
--
-- This column makes those events queryable instead of anecdotal. Written
-- by log-impressions.ts alongside the existing is_cold_start/reason
-- fields -- null/empty means nothing degraded for that recommendation.
alter table public.recommendation_impressions
  add column degraded_signals text[];

-- The specific query finding #1's bug needed and didn't have: how often
-- is is_cold_start = true for a user who isn't actually a new signup.
-- Partial index keeps it cheap -- cold-start rows are the minority once a
-- product has real usage, and this is exactly the slice worth being able
-- to query fast.
create index recommendation_impressions_cold_start_idx
  on public.recommendation_impressions (user_id, served_at desc)
  where is_cold_start = true;
