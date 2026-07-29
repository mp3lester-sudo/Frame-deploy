-- similar_users_liked needs to read OTHER users' taste_vectors rows to do
-- its job (collaborative filtering is inherently cross-user) — but
-- taste_vectors' RLS policy ("own taste vector", migration 0002) restricts
-- SELECT to auth.uid() = user_id. This function is `language plpgsql`
-- with no security clause, which defaults to SECURITY INVOKER: it runs
-- with the CALLING user's privileges, so RLS applies to its internal
-- queries too. That means the `neighbors` CTE's cross join against
-- taste_vectors — filtered to `tv.user_id <> p_user_id` — was ALWAYS
-- empty for any real signed-in caller: RLS only ever let them see their
-- own row, which that filter explicitly excludes.
--
-- In other words: the collaborative half of the hybrid recommendation
-- engine (src/lib/recommendations/engine.ts, COLLABORATIVE_WEIGHT = 0.35)
-- has been silently contributing nothing for every real user. It only
-- ever looked like it worked in this project's own verify-*.ts scripts,
-- which call it via a service-role client that bypasses RLS entirely —
-- masking the bug in every test that ran it that way.
--
-- The fix: SECURITY DEFINER, so the function runs with its owner's
-- privileges (bypassing RLS) regardless of who calls it — the standard,
-- safe pattern for exactly this situation, since the function only ever
-- returns an aggregated (title_id, score) pair, never another user's id,
-- ratings, or embedding directly. `set search_path = public` is the
-- accompanying best practice for any SECURITY DEFINER function, so it
-- can't be tricked by a caller-controlled search_path into resolving
-- public.titles/ratings/etc. to some other schema.
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
security definer
set search_path = public
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
