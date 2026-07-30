-- Movie Night's candidate pool is seeded per-participant via
-- match_titles_for_user(p_exclude_watched: true), which only excludes
-- titles the SEEDING participant has watched. The exact-scoring pass
-- (title_similarity_for_user, migration 0023) has no watched-exclusion at
-- all. Net effect: a title one participant already watched can still
-- surface in the shared pool via another participant's seed contribution,
-- and nothing downstream ever checks the other participants' watch
-- history against it.
--
-- watch_history is private to its owner (migration 0002's "own watch
-- history" policy is `auth.uid() = user_id`, no public-read policy), so a
-- normal query from whichever participant's session is loading the page
-- can only ever see their own rows — same RLS-across-users bug class as
-- migrations 0022/0023. This RPC runs as the function owner regardless of
-- caller, and only ever returns which title_ids were watched by SOMEONE in
-- the given set — never whose row it was, never any rating or other
-- per-user detail.
create or replace function public.titles_watched_by_users(
  p_user_ids uuid[],
  p_title_ids uuid[]
)
returns table (title_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct wh.title_id
  from public.watch_history wh
  where wh.user_id = any(p_user_ids)
    and wh.title_id = any(p_title_ids);
$$;
