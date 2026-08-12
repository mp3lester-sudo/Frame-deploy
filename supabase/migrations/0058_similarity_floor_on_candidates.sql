-- Recommendation accuracy round 3: candidate-source similarity floor.
--
-- Root cause found by reading every migration that has ever redefined
-- match_titles_for_user (0003 -> 0023 -> 0026) and similar_users_liked
-- (0003 -> 0021 -> 0022): neither has EVER had a minimum-similarity/
-- closeness floor. Both just do `order by <distance> limit p_match_count`
-- unconditionally. That means for a user whose taste vector sits in a
-- sparse region of the ~36k-title embedding space, or who simply doesn't
-- have p_match_count genuinely close neighbors/titles available, these
-- RPCs still hand back p_match_count rows regardless of how weak the
-- closest available match actually is -- the "nearest" title/user is
-- still returned even when "nearest" means "not very close at all."
--
-- Those weak candidates then enter engine.ts's blended scoring pool with
-- real weight, and after quality/genre-affinity boosts (up to 1.6x for
-- low-confidence/new users, see curation-confidence.ts) a merely-weak
-- match can still rank into the final top-5 slate -- directly matching
-- the reported symptom: recommendations that "have nothing to do with my
-- taste."
--
-- Fix: both functions gain a minimum-similarity parameter and filter on
-- it, so a thin/weak match is excluded from the candidate pool entirely
-- rather than padded in just to fill out p_match_count. engine.ts passes
-- explicit MIN_CONTENT_SIMILARITY / MIN_NEIGHBOR_CLOSENESS constants (see
-- that file) so the bars are visible and tunable in one place, not buried
-- in a SQL default.
--
-- Defaults on the SQL side are set conservatively (permissive) since
-- there's no DB access this session to sample real production cosine-
-- similarity distributions and calibrate precisely -- engine.ts overrides
-- them explicitly rather than relying on these defaults, and the defaults
-- exist only so any other/ad-hoc caller doesn't silently regress to zero
-- floor. If accuracy still looks off after this ships, the fix is to
-- raise these numbers once real score distributions can be sampled from
-- the DB, not to re-architect the approach.
create or replace function public.match_titles_for_user(
  p_user_id uuid,
  p_match_count int default 20,
  p_exclude_watched boolean default true,
  p_min_similarity float default 0.2
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
    and (1 - (te.embedding <=> tv.embedding)) >= p_min_similarity
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

create or replace function public.similar_users_liked(
  p_user_id uuid,
  p_match_count int default 20,
  p_min_closeness float default 0.1
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
  with target as (
    select embedding from public.taste_vectors where user_id = p_user_id
  ),
  neighbors as (
    -- The floor belongs here, on neighbor admission, not on the final
    -- title score below -- a handful of only-loosely-similar "neighbors"
    -- averaging in a couple of 5-star ratings can still produce a
    -- respectable-looking score even though nobody genuinely taste-close
    -- to this user actually loved the title. Filtering out weak neighbors
    -- before they can vote at all is the more direct fix.
    select tv.user_id, 1 - (tv.embedding <=> target.embedding) as closeness
    from public.taste_vectors tv, target
    where tv.user_id <> p_user_id
      and (1 - (tv.embedding <=> target.embedding)) >= p_min_closeness
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
