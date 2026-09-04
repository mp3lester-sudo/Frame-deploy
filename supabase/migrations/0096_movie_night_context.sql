-- Movie Night bar (home page): lets the host pick "Date night" or "With
-- friends" when starting a session, reusing the same two circumstantial-
-- context labels the solo ContextPicker already uses (see
-- src/lib/context/circumstantial.ts) so the language is consistent across
-- the app instead of inventing a second vocabulary for the same idea.
-- Nullable: every pre-existing row, and any night started from the plain
-- "Start a movie night" button on /movie-night (no mode selection there),
-- has no context and that's a fine, valid state -- this is display/framing
-- metadata, not a required field.
alter table public.movie_nights
  add column context text check (context in ('date_night', 'with_friends'));
