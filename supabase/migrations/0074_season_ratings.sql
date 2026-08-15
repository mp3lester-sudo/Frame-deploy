-- TV modernization pass, part 2: optional per-season ratings.
--
-- Explicitly additive, not a replacement for public.ratings -- a user can
-- rate "Breaking Bad" as a whole (existing ratings table, unchanged) AND
-- separately rate season 4 five stars / season 5 three stars if they want
-- to be that specific. Nothing reads this table yet outside its own
-- server actions and UI: the taste vector, Wrapped, and Cinema Score all
-- keep computing off the whole-show rating exactly as before, so this
-- ships with zero risk to the existing recommendation engine. Wiring
-- season-level signal into those systems is a deliberate follow-up, not
-- part of this migration.
create table public.season_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  season_number integer not null check (season_number >= 0),
  score numeric(2,1) not null check (score >= 0.5 and score <= 5.0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title_id, season_number)
);

create index season_ratings_title_idx on public.season_ratings (title_id);

alter table public.season_ratings enable row level security;

create policy "season ratings are public" on public.season_ratings for select using (true);
create policy "users manage own season ratings" on public.season_ratings
  for insert with check (auth.uid() = user_id);
create policy "users update own season ratings" on public.season_ratings
  for update using (auth.uid() = user_id);
create policy "users delete own season ratings" on public.season_ratings
  for delete using (auth.uid() = user_id);
