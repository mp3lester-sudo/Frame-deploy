-- "Wrapped" recap shares — a lightweight public snapshot so a link can be
-- posted anywhere (iMessage, Twitter, Discord) and render for someone who
-- isn't logged in and has no session, the same way Spotify Wrapped links
-- work. Deliberately a frozen snapshot (jsonb), not a live query re-run for
-- anonymous visitors: (1) it's what "Wrapped" conceptually is — a moment
-- in time, not a live dashboard, so it shouldn't silently change under the
-- shared link as the owner rates more titles; (2) it means the public share
-- page and its opengraph-image route need zero auth and zero access to the
-- owner's private ratings, just this one row.
create table public.wrapped_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  year integer not null,
  stats jsonb not null,
  created_at timestamptz not null default now()
);

create index wrapped_shares_user_id_idx on public.wrapped_shares (user_id);

alter table public.wrapped_shares enable row level security;

-- Public read (this is the whole point — an anonymous visitor following a
-- shared link, and the opengraph-image route generating its preview card,
-- both read with the anon key, no session). Only the recap stats + year
-- are ever in here, nothing more sensitive than what's already public on a
-- profile page.
create policy "wrapped shares are public" on public.wrapped_shares for select using (true);

-- Only the owner can create a share of their own year, and shares are
-- otherwise immutable (no update/delete policy — a frozen snapshot is the
-- point; letting people mutate a link after sharing it would undermine
-- that).
create policy "users create own wrapped shares" on public.wrapped_shares
  for insert with check (auth.uid() = user_id);
