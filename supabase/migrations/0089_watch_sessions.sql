-- "Press Play" live watch-progress tracking (magic-moment: watch together).
--
-- Slate doesn't host video itself -- Where to Watch only ever deep-links out
-- to Netflix/Amazon/etc -- so there's no way to read a real playback
-- position back from the streaming app. This is a deliberately honest
-- self-reported timer instead: pressing Play starts a clock based on the
-- title's own runtime_minutes, pause/resume adjusts accumulated_seconds
-- rather than trusting elapsed wall-clock time while paused, and the
-- client computes "now" progress from timestamps rather than the server
-- writing every second (matches this app's established "never slow down
-- the page" rule -- see theme-preset.ts/evolution.ts precedent of doing
-- the minimum possible DB work).
--
-- movie_night_id is nullable and optional: the same row shape covers both
-- solo Continue Watching (movie_night_id null) and a Movie Night's "watch
-- together" mode (movie_night_id set, one row per participant), so the
-- group view is just "every other participant's session for this night,"
-- not a separate synced-playback system.
create table public.watch_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  movie_night_id uuid references public.movie_nights(id) on delete set null,
  runtime_minutes integer,
  status text not null default 'playing' check (status in ('playing', 'paused', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  accumulated_seconds integer not null default 0,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "Do I already have an in-progress session for this title" lookup (solo
-- Continue Watching / re-opening the movie page) and "who in this Movie
-- Night is currently watching" both hit this table by a narrow filter, so
-- partial indexes on the only rows either query actually cares about
-- (still playing/paused, not the long tail of completed/abandoned history)
-- keep both cheap regardless of how large the table gets over time.
create index watch_sessions_user_title_active_idx on public.watch_sessions (user_id, title_id)
  where status in ('playing', 'paused');
create index watch_sessions_movie_night_active_idx on public.watch_sessions (movie_night_id)
  where movie_night_id is not null and status in ('playing', 'paused');

alter table public.watch_sessions enable row level security;

-- Same "own X" pattern as watchlist/watch_history/taste_twin_cache: a
-- session is always created, paused, resumed, and completed by its own
-- owner, never on someone else's behalf.
create policy "own watch sessions" on public.watch_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The one deliberate exception: everyone else in the same Movie Night can
-- *read* (never write) a participant's session, which is what makes the
-- group "watching now" view possible -- mirrors the movie_night_votes /
-- movie_night_participants pattern of "your own night's roster is visible
-- to your own night's roster."
create policy "movie night participants read each other's sessions" on public.watch_sessions
  for select using (
    movie_night_id is not null
    and exists (
      select 1 from public.movie_night_participants p
      where p.movie_night_id = watch_sessions.movie_night_id
        and p.user_id = auth.uid()
    )
  );

-- Live group progress (Watch Together) needs Postgres change broadcasts
-- the same way LiveParticipants/LiveCandidateVoting already do for
-- movie_night_participants/movie_night_votes (see migration 0033) --
-- without this, saving/advancing a session updates the row correctly but
-- no subscribed client ever hears about it.
alter publication supabase_realtime add table public.watch_sessions;
