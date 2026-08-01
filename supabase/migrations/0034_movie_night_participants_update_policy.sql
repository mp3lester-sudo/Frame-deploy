-- Fixes the real root cause of "recommendations don't populate contingent
-- upon preferences": movie_night_participants has row level security
-- enabled (migration 0002), but no policy was ever added for UPDATE --
-- only "participants visible to participants" (select) and "users join
-- movie night as self" / "host invites participants" (insert) exist. With
-- RLS enabled and no matching policy for a command, Postgres doesn't error
-- on an UPDATE -- it just matches zero rows and reports success. So every
-- call to setMyMovieNightPreferences (src/lib/actions/movie-night.ts) has
-- been silently updating nothing, the whole time this feature has
-- existed, regardless of migration 0033 or any client-side change.
--
-- Mirrors the existing pattern from movie_night_votes (migration 0030,
-- "participants change their own vote").
create policy "participants update their own preferences" on public.movie_night_participants
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
