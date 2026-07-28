-- Movie clubs: persistent, joinable groups with their own discussion feed
-- (distinct from the ephemeral, one-off Movie Night sessions in
-- movie_nights/movie_night_participants). MVP scope is all-public clubs —
-- no private/invite-only clubs yet, which keeps the RLS on club_members
-- simple (a plain "you manage your own membership row" policy rather than
-- a self-referencing membership check).
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index club_members_user_idx on public.club_members(user_id);
create index club_posts_club_idx on public.club_posts(club_id);

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_posts enable row level security;

create policy "clubs are public" on public.clubs for select using (true);
create policy "users create clubs" on public.clubs for insert with check (auth.uid() = created_by);

create policy "club membership is public" on public.club_members for select using (true);
create policy "users join clubs themselves" on public.club_members
  for insert with check (auth.uid() = user_id);
create policy "users leave clubs themselves" on public.club_members
  for delete using (auth.uid() = user_id);

-- Posts stay members-only even though club listings/rosters are public —
-- you have to join to read (and post in) the discussion.
create policy "club posts readable by members" on public.club_posts
  for select using (exists (
    select 1 from public.club_members m where m.club_id = club_posts.club_id and m.user_id = auth.uid()
  ));
create policy "members post in their clubs" on public.club_posts
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.club_members m where m.club_id = club_posts.club_id and m.user_id = auth.uid())
  );
create policy "users delete own club posts" on public.club_posts
  for delete using (auth.uid() = user_id);
