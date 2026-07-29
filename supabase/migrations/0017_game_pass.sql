-- Game Pass — a monthly, gamified watch challenge. Letterboxd has nothing
-- like this: a curated monthly theme (e.g. "90s Neo-Noir") with one movie
-- per calendar day, personalized per user within that theme using the
-- Taste Graph, laid out as a board-game-style pathway. Watch all of a
-- month's picks and you complete the season.
--
-- Seasons are created lazily by app code the first time anyone visits the
-- page in a given month (period_start's unique constraint makes that safe
-- under concurrent requests) rather than by a scheduled job — no cron
-- infrastructure needed for v1.
--
-- Completion is derived from the existing watch_history table (a rating
-- already upserts a watch_history row, per rateTitle() in
-- src/lib/actions/social.ts) rather than a separate tracking table — one
-- source of truth for "did they actually watch it."
create table public.game_pass_seasons (
  id uuid primary key default gen_random_uuid(),
  -- Always the 1st of the month (e.g. 2026-08-01) — the natural key for
  -- "which season is this," and what the unique constraint races against.
  period_start date not null unique,
  day_count int not null check (day_count between 28 and 31),
  theme_name text not null,
  theme_description text not null,
  theme_genres text[] not null default '{}',
  theme_keywords text[] not null default '{}',
  theme_decade_min int,
  theme_decade_max int,
  created_at timestamptz not null default now()
);

create table public.game_pass_entries (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.game_pass_seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Generic hook: set once a reward has been granted for this completed
  -- season. What the reward actually *is* isn't decided yet — this just
  -- marks that granting happened, so it isn't granted twice.
  reward_granted_at timestamptz,
  unique (season_id, user_id)
);

create table public.game_pass_picks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.game_pass_seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day_number int not null check (day_number >= 1),
  title_id uuid not null references public.titles(id),
  generated_at timestamptz not null default now(),
  unique (season_id, user_id, day_number),
  -- A title shouldn't repeat within the same person's same-season path.
  unique (season_id, user_id, title_id)
);

create index game_pass_entries_user_idx on public.game_pass_entries(user_id);
create index game_pass_picks_user_season_idx on public.game_pass_picks(user_id, season_id);

alter table public.game_pass_seasons enable row level security;
alter table public.game_pass_entries enable row level security;
alter table public.game_pass_picks enable row level security;

-- Seasons/themes are the same for everyone and not sensitive — public read.
-- Deliberately no client-facing INSERT policy: seasons are created only
-- through get_or_create_game_pass_season below, so a modified client can't
-- POST arbitrary/bogus theme data into a table every user reads from.
create policy "anyone can read seasons" on public.game_pass_seasons
  for select using (true);

create policy "users see their own entries" on public.game_pass_entries
  for select using (auth.uid() = user_id);
create policy "users join with their own id" on public.game_pass_entries
  for insert with check (auth.uid() = user_id);
-- Deliberately no client-facing UPDATE policy on game_pass_entries.
-- completed_at and reward_granted_at are earned, not self-reported — a
-- generic "users update their own entry" policy would let anyone mark
-- themselves complete without actually watching anything. Both fields are
-- only ever written by the SECURITY DEFINER functions below, which
-- recompute eligibility from watch_history themselves rather than trusting
-- client-submitted values.

create policy "users see their own picks" on public.game_pass_picks
  for select using (auth.uid() = user_id);
create policy "users generate their own picks" on public.game_pass_picks
  for insert with check (auth.uid() = user_id);

-- Re-derives completion from watch_history itself (never trusts a
-- client-submitted "I finished" claim) and sets completed_at exactly once.
-- Safe to call speculatively any time (e.g. after every rating) — a no-op
-- once already complete or if any day is still unwatched.
create or replace function public.check_and_complete_game_pass(p_season_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_watched int;
  v_already_completed timestamptz;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not authorized';
  end if;

  select completed_at into v_already_completed from public.game_pass_entries
  where season_id = p_season_id and user_id = p_user_id;
  if v_already_completed is not null then
    return true;
  end if;

  select count(*) into v_total from public.game_pass_picks
  where season_id = p_season_id and user_id = p_user_id;

  select count(*) into v_watched
  from public.game_pass_picks gpp
  join public.watch_history wh on wh.user_id = gpp.user_id and wh.title_id = gpp.title_id
  where gpp.season_id = p_season_id and gpp.user_id = p_user_id;

  if v_total > 0 and v_watched >= v_total then
    update public.game_pass_entries
    set completed_at = now()
    where season_id = p_season_id and user_id = p_user_id;
    return true;
  end if;

  return false;
end;
$$;

-- The reward hook. What "reward" means isn't decided yet (see migration
-- comment) — this just marks that granting happened, exactly once, only
-- after real completion, so a real fulfillment mechanism can be dropped in
-- later without changing this contract.
create or replace function public.grant_game_pass_reward(p_season_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not authorized';
  end if;

  select * into v_entry from public.game_pass_entries
  where season_id = p_season_id and user_id = p_user_id;

  if v_entry is null or v_entry.completed_at is null then
    return false;
  end if;
  if v_entry.reward_granted_at is not null then
    return true;
  end if;

  update public.game_pass_entries
  set reward_granted_at = now()
  where season_id = p_season_id and user_id = p_user_id;
  return true;
end;
$$;

-- The only way a season row gets created. Idempotent under concurrent
-- callers (the unique constraint on period_start + "on conflict do
-- nothing" means whoever loses the race just reads back the winner's row)
-- and requires no client-facing INSERT policy on the table at all.
create or replace function public.get_or_create_game_pass_season(
  p_period_start date,
  p_day_count int,
  p_theme_name text,
  p_theme_description text,
  p_theme_genres text[],
  p_theme_keywords text[],
  p_theme_decade_min int,
  p_theme_decade_max int
)
returns public.game_pass_seasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.game_pass_seasons;
begin
  insert into public.game_pass_seasons (
    period_start, day_count, theme_name, theme_description,
    theme_genres, theme_keywords, theme_decade_min, theme_decade_max
  )
  values (
    p_period_start, p_day_count, p_theme_name, p_theme_description,
    p_theme_genres, p_theme_keywords, p_theme_decade_min, p_theme_decade_max
  )
  on conflict (period_start) do nothing;

  select * into v_season from public.game_pass_seasons where period_start = p_period_start;
  return v_season;
end;
$$;
