-- A personal "want to watch" queue, distinct from the custom named lists
-- (public.lists / public.list_items, already defined in 0001_init.sql but
-- never wired up to any UI until now). Modeled after watch_history/ratings
-- rather than as a special reserved list, since it's a single fixed
-- per-user set rather than something a user names, describes, or makes
-- public — matching Letterboxd's own split between one default Watchlist
-- and any number of custom Lists.
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id uuid not null references public.titles(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (user_id, title_id)
);

create index watchlist_user_idx on public.watchlist(user_id);

alter table public.watchlist enable row level security;

-- Private to the owner, same as watch_history — a want-to-watch queue is
-- personal, not a public claim like a rating or review.
create policy "own watchlist" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
