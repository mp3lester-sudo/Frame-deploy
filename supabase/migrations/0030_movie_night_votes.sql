-- Live, synchronous Movie Night voting. Previously only the host saw the
-- fairness-ranked candidate pool and picked directly; now every participant
-- votes on the same shared pool and watches the tally update live via
-- Supabase Realtime, with the host still making the final call (see
-- decideMovieNight in src/lib/actions/movie-night.ts, unchanged) informed by
-- the group's actual live consensus instead of guessing blind.
create table public.movie_night_votes (
  movie_night_id uuid not null references public.movie_nights(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('like', 'pass')),
  created_at timestamptz not null default now(),
  primary key (movie_night_id, title_id, user_id)
);

create index movie_night_votes_night_idx on public.movie_night_votes (movie_night_id);

alter table public.movie_night_votes enable row level security;

-- Reuses the SECURITY DEFINER helper from migration 0005 (is_movie_night_participant)
-- rather than a raw EXISTS subquery, both for consistency with the rest of
-- Movie Night's RLS and because it's already proven safe against the
-- self-referential recursion bug that helper was built to fix.
create policy "participants view votes in their movie nights" on public.movie_night_votes
  for select using (public.is_movie_night_participant(movie_night_id, auth.uid()));

create policy "participants cast their own vote" on public.movie_night_votes
  for insert with check (
    auth.uid() = user_id and public.is_movie_night_participant(movie_night_id, auth.uid())
  );

create policy "participants change their own vote" on public.movie_night_votes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: broadcasts row changes on this table to subscribed clients so
-- every participant's vote appears live for everyone else in the room,
-- without a page refresh or poll.
alter publication supabase_realtime add table public.movie_night_votes;

-- Also broadcast movie_nights row changes (status/decided_title_id) so a
-- non-host participant's screen flips to the "decided" view live the
-- moment the host finalizes, rather than needing to refresh.
alter publication supabase_realtime add table public.movie_nights;
