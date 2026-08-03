-- Cinema Score: replaces the self-reported "experience_tier" onboarding
-- pick (profiles.experience_tier, rookie/intermediate/pro, shown as
-- Casual Viewer/Film Buff/Cinephile) with a value earned from actual
-- watching/reviewing activity. The column itself is left in place --
-- dropping it isn't necessary, and there's no migration on file for how
-- it was originally added, so this deliberately doesn't touch it -- but
-- the app no longer reads or writes it for the tier badge; every write
-- path (onboarding's tier picker, the Settings editor) is removed in the
-- same change this migration ships with.
--
-- +50 points per title watched (a rating counts as watched, matching the
-- existing convention used by the Watched stat chip and /watched page --
-- there's no rating-free watch record actually in use anywhere), +50 more
-- (100 total) if that title also has a review. distinct is used
-- throughout even though ratings already has a unique(user_id, title_id)
-- constraint, because reviews has no equivalent constraint.
--
-- security invoker (the default, stated explicitly for clarity): this
-- runs as whichever role calls it, subject to that role's own RLS on
-- ratings/reviews -- both tables are already publicly readable (profile
-- pages already show other users' Watched counts and reviews), so no
-- elevated privilege is needed here, unlike the security definer
-- functions elsewhere in Movie Night that specifically exist to bypass
-- RLS for a not-yet-a-participant caller.
create or replace function public.compute_cinema_score(p_user_id uuid)
returns table (watched_count int, reviewed_count int, points int)
language sql
stable
security invoker
set search_path = public
as $$
  with watched_titles as (
    select title_id from public.ratings where user_id = p_user_id
    union
    select title_id from public.reviews where user_id = p_user_id
  ),
  reviewed_titles as (
    select distinct title_id from public.reviews where user_id = p_user_id
  )
  select
    (select count(*) from watched_titles)::int as watched_count,
    (select count(*) from reviewed_titles)::int as reviewed_count,
    (
      (select count(*) from watched_titles) * 50
      + (select count(*) from reviewed_titles) * 50
    )::int as points;
$$;

grant execute on function public.compute_cinema_score(uuid) to authenticated;
