-- "Where to watch" — same lazy fetch-on-view caching pattern as RT scores
-- and person bios (migration 0024): the streaming_availability table has
-- existed since the very first migration but nothing has ever populated
-- it. TMDB's free /movie|tv/{id}/watch/providers endpoint (JustWatch data)
-- is the source; the first movie-page view for a given title triggers the
-- lookup, streaming_checked_at is set (even on a genuine "not available
-- anywhere" miss) so we don't re-hit TMDB on every subsequent view.
alter table public.titles
  add column streaming_checked_at timestamptz;

create index titles_streaming_checked_idx on public.titles (streaming_checked_at);

-- TMDB's watch-providers response includes a logo per provider (needed for
-- a real "where to watch" row of service logos, not just plain text) which
-- the original schema had no column for.
alter table public.streaming_availability
  add column logo_url text;
