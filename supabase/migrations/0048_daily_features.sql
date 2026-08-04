-- Daily page: On This Day, Daily Trivia, Daily News (task: Daily page pass 2).

-- On This Day -- real releases whose release_date falls on today's
-- calendar month/day, across any year. Read-only helper so the app can
-- do this lookup without PostgREST support for date-part filtering;
-- ordered by weighted_rating so the most notable release for today leads.
create or replace function public.titles_on_this_day(p_month int, p_day int, p_limit int default 3)
returns table(id uuid, name text, poster_url text, release_date date, weighted_rating numeric)
language sql
stable
as $$
  select t.id, t.name, t.poster_url, t.release_date, t.weighted_rating
  from public.titles t
  where extract(month from t.release_date) = p_month
    and extract(day from t.release_date) = p_day
  order by t.weighted_rating desc nulls last
  limit p_limit;
$$;

-- Daily Trivia -- one shared question per calendar day (UTC), built from
-- real catalogue data (director/year/genre templates -- see
-- lib/daily-trivia/generate.ts), not freeform AI trivia. Shared across all
-- users, not personalized. Written only via the service-role client (same
-- convention as every other service-role-write-only table in this
-- project), so there is no insert/update policy for regular users.
create table public.daily_trivia (
  date_key text primary key,
  title_id uuid references public.titles(id),
  question_type text not null,
  question text not null,
  options jsonb not null,
  correct_index smallint not null,
  created_at timestamptz not null default now()
);

alter table public.daily_trivia enable row level security;

create policy "daily_trivia_select_all" on public.daily_trivia
  for select to authenticated using (true);

-- Per-user attempt tracking -- one answer per person per day, so a page
-- refresh can't be used to re-guess after seeing the reveal, and so the
-- correct answer is only ever sent to a client that has already answered.
create table public.daily_trivia_responses (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date_key text not null,
  selected_index smallint not null,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date_key)
);

alter table public.daily_trivia_responses enable row level security;

create policy "daily_trivia_responses_select_own" on public.daily_trivia_responses
  for select to authenticated using (auth.uid() = user_id);

create policy "daily_trivia_responses_insert_own" on public.daily_trivia_responses
  for insert to authenticated with check (auth.uid() = user_id);
