-- iOS home-screen widget: a "today's pick" WidgetKit extension that runs
-- as its own separate OS process with no cookies/session of any kind, so
-- it needs its own lightweight bearer credential (widget_token) rather
-- than reusing the web app's Supabase auth session.
--
-- Nullable, minted on first use (see getOrCreateWidgetToken in
-- src/lib/actions/widget.ts) rather than backfilled/defaulted for every
-- row the way movie_nights.invite_token is (0037) -- unlike an invite
-- link, which is useful the moment a session exists, a widget token is
-- only worth generating for someone who's actually adding the widget.
alter table public.profiles add column widget_token text unique;

-- daily_picks: a get-or-create-once-per-day cache in front of the full
-- recommendation engine (engine.ts) -- WidgetKit refreshes a widget's
-- timeline several times a day on the OS's own schedule, completely
-- independent of whether the person ever opens the app that day. Without
-- this, every one of those refreshes would re-run content scoring +
-- diversification from scratch (easily the most expensive call in the
-- codebase, see the Discover page's own recent fix for the same
-- problem) for a "pick of the day" that's supposed to stay the same all
-- day anyway. Mirrors director_of_the_day's daily-rotation shape
-- (director-of-day/pick.ts) but persisted here (rather than recomputed
-- from ratings on every call) since the underlying engine call is far
-- more expensive than a director ranking.
create table public.daily_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pick_date date not null,
  title_id uuid not null references public.titles(id) on delete cascade,
  match_percent int,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (user_id, pick_date)
);

create index daily_picks_user_idx on public.daily_picks(user_id);

alter table public.daily_picks enable row level security;

-- Read via the service-role client from the widget API route (no
-- auth.uid() session exists for a WidgetKit request -- see
-- src/app/api/widget/daily-pick/route.ts, which validates the bearer
-- widget_token by hand instead), same privileged-server-only pattern as
-- push_subscriptions' send path (0041). This policy exists purely so a
-- signed-in web/app session could read their own cached pick directly if
-- a future in-app surface wants it, mirroring every other per-user table
-- in this schema.
create policy "own daily picks" on public.daily_picks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
