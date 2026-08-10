-- Recommendation accuracy round 2, step 1: a feedback loop. Nothing today
-- records what a user was actually recommended, so there's no way to check
-- whether a high match% correlates with a title the user goes on to rate
-- well, or whether one signal (content vs. collaborative vs. context) is
-- pulling its weight. This table is the missing half of that measurement --
-- write-only from the app (see log-impressions.ts), read via ad-hoc SQL in
-- the Supabase editor for now rather than a dashboard, since this is
-- diagnostic/analytical, not a feature the app itself reads back.
--
-- RLS enabled with zero policies -- same lockout pattern as
-- debug_error_log (migration 0050): only the service-role client (which
-- bypasses RLS) can read or write, so no anon/authenticated client can see
-- what other users were recommended.
create table public.recommendation_impressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  -- Null for cold-start picks (getColdStartRecommendations never computes
  -- a match%) -- matches the nullable matchPercent already on the
  -- Recommendation type in engine.ts.
  match_percent int,
  is_cold_start boolean not null default false,
  -- Short reason headline (detail.headline) at time of serving -- lets a
  -- later query check "did content-matched picks land better than
  -- collaborative-matched picks" without re-deriving anything.
  reason text,
  -- Where it was served -- home page vs. onboarding completion today (see
  -- getRecommendationsForUser's callers); room for more surfaces later
  -- without a schema change.
  source text not null default 'home',
  served_at timestamptz not null default now()
);

create index recommendation_impressions_user_served_idx
  on public.recommendation_impressions (user_id, served_at desc);
create index recommendation_impressions_title_idx
  on public.recommendation_impressions (title_id);

alter table public.recommendation_impressions enable row level security;
