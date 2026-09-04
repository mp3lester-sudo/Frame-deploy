-- Fixes a live, user-reported bug: an account with 500+ ratings
-- intermittently sees the "Popular right now -- rate a few titles to
-- personalize this" cold-start fallback instead of their real picks,
-- flipping back and forth between the two on otherwise-identical page
-- loads. This is NOT the "no taste vector yet" case engine.ts's
-- self-heal logic (recommendation intelligence audit finding #1)
-- already handles -- that's for a genuinely missing/stale vector. This
-- is a *live* account with a fresh vector whose match_titles_for_user
-- call occasionally times out under load: migration 0081's own comment
-- already documents that this project's compute tier under-costs the
-- ivfflat index and needs a forced index scan, and 0094 raised the
-- statement_timeout from 2500ms to 5000ms specifically because it was
-- already seeing exactly this failure mode ("a too-aggressive DB
-- timeout doesn't just make the page slower -- it can silently swap
-- personalized recommendations for the generic popularity fallback").
-- Since then, task #851 widened Home's hero cycling pool from a small
-- limit to limit=16 -- with CANDIDATE_POOL_MULTIPLIER=8, that's
-- p_match_count=128, which pushes match_titles_for_user's own internal
-- ANN pool (least(greatest(p_match_count*15,800),3000)) up to 1920
-- rows, nearly double what the 5000ms budget in 0094 was tuned
-- against. engine.ts's three existing self-heal/retry layers all retry
-- the *same* expensive query shape, so under real load they can all
-- three time out in the same request -- which is the exact
-- "flip-flopping" symptom reported live.
--
-- Rather than chase the timeout number a further time (already tuned
-- twice, still a moving target as the query's own cost has grown),
-- this adds a genuine safety net: cache the title_id/similarity pairs
-- from every request that DID get a real result, and read that cache
-- back only when every live attempt this request has already failed.
-- A degraded request then shows the user's own real recent picks
-- (at most a little stale) instead of falling all the way through to
-- a generic, unpersonalized popularity list -- categorically better
-- for a 500+-rating account than the swap the bug report is about,
-- and still strictly a self-heal/fallback: a genuinely new user with
-- no cache row yet still correctly falls through to true cold start.
create table public.recommendation_cache (
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  matches jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, media_type)
);

alter table public.recommendation_cache enable row level security;

-- Same "own X" pattern as taste_vectors/taste_twin_cache -- this is
-- purely a per-user performance fallback, never read or written on
-- anyone else's behalf.
create policy "own recommendation cache" on public.recommendation_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
