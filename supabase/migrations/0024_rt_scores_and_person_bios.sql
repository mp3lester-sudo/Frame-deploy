-- Adds columns for two new features:
--   1. Rotten Tomatoes critic score, fetched lazily per-title on movie page
--      view (see src/lib/external/rotten-tomatoes.ts) rather than bulk
--      backfilled, since the free OMDb tier is capped at 1,000 req/day and
--      the catalogue has ~36k titles. rt_checked_at is set even on a miss
--      (no OMDb match / no RT score for the title) so we don't re-hit the
--      API on every subsequent page view of an obscure title.
--   2. Person bio/birthday/place_of_birth, same lazy fetch-on-view pattern
--      via TMDB's /person/{id} endpoint (see src/lib/external/tmdb-person.ts),
--      triggered from the new /person/[id] profile page.

alter table public.titles
  add column imdb_id text,
  add column rt_critic_score smallint check (rt_critic_score between 0 and 100),
  add column rt_checked_at timestamptz;

alter table public.people
  add column bio text,
  add column birthday date,
  add column place_of_birth text,
  add column bio_checked_at timestamptz;

-- Supports the "still needs a lazy fetch?" check without a full table scan.
create index titles_rt_checked_idx on public.titles (rt_checked_at) where type = 'movie';
create index people_bio_checked_idx on public.people (bio_checked_at);

-- Filmography lookups on the person profile page: all credits for a given
-- person, joined back to titles, ordered by release date.
create index title_credits_person_id_idx on public.title_credits (person_id);
