-- Taste Twin (magic-moments audit, task #754) -- opt-in only, and only ever
-- computed/shown among *mutual* follows (both people follow each other),
-- never the wider user base. Two pieces:
--
-- 1. profiles.taste_twin_opt_in -- off by default. Nobody's compatibility
--    is computed or surfaced to anyone else until they explicitly turn
--    this on in Settings.
-- 2. taste_twin_cache -- one row per opted-in user holding their best
--    mutual-follow match (>=85%, computed the same way Movie Night/profile
--    compatibility already is -- see compute-taste-twin.ts), refreshed
--    lazily (on next profile/home view) once a day rather than via a new
--    cron job. Strictly private: only the row's own owner can ever read
--    or write it, same "own X" RLS pattern as taste_vectors/taste_attributes.

alter table public.profiles
  add column taste_twin_opt_in boolean not null default false;

create table public.taste_twin_cache (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  twin_user_id uuid references public.profiles(id) on delete set null,
  percent integer,
  shared_favorite_genres text[] default '{}',
  computed_at timestamptz not null default now()
);

alter table public.taste_twin_cache enable row level security;

create policy "own taste twin cache" on public.taste_twin_cache
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
