-- The Letterboxd import action (matchAndUpsertRows, src/lib/actions/import.ts)
-- was pulling the ENTIRE titles table (36.5k+ rows, 37 paginated requests)
-- into JS on every single import call, just to build a name/year lookup
-- index — even for a two-film paste. That alone takes ~5+ seconds against
-- the live catalogue, which is enough to blow past Vercel's serverless
-- function timeout (5-10s on the Hobby plan with no custom maxDuration
-- configured), failing with an opaque, digest-only "Server Components
-- render" error that gives no hint it was a timeout.
--
-- This replaces that with a single query that returns only the titles whose
-- name plausibly matches something the user is actually importing — a
-- typical diary import touches at most a few hundred distinct names, not
-- the whole catalogue. buildTitleIndex/matchTitle (src/lib/import/letterboxd.ts)
-- are unchanged; they just now run against this much smaller candidate set
-- instead of everything.
create or replace function public.titles_matching_names(p_names text[])
returns table (
  id uuid,
  name text,
  release_date date
)
language sql
stable
as $$
  select t.id, t.name, t.release_date
  from public.titles t
  where lower(t.name) = any (
    select lower(x) from unnest(p_names) as x
  );
$$;
