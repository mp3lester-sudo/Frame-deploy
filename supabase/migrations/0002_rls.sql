-- Taste — Phase 3: Row-Level Security
-- Catalog tables are public-read. User-owned tables are scoped to auth.uid().

alter table public.profiles enable row level security;
alter table public.titles enable row level security;
alter table public.people enable row level security;
alter table public.title_credits enable row level security;
alter table public.streaming_availability enable row level security;
alter table public.watch_history enable row level security;
alter table public.ratings enable row level security;
alter table public.reviews enable row level security;
alter table public.review_reactions enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.follows enable row level security;
alter table public.activity_events enable row level security;
alter table public.movie_nights enable row level security;
alter table public.movie_night_participants enable row level security;
alter table public.title_embeddings enable row level security;
alter table public.taste_vectors enable row level security;
alter table public.taste_attributes enable row level security;
alter table public.subscriptions enable row level security;

-- ---- Public catalog: anyone (incl. anon) can read ----
create policy "titles are public" on public.titles for select using (true);
create policy "people are public" on public.people for select using (true);
create policy "credits are public" on public.title_credits for select using (true);
create policy "availability is public" on public.streaming_availability for select using (true);
create policy "embeddings are public" on public.title_embeddings for select using (true);

-- Catalog writes: service role only (ingestion pipeline), enforced by not
-- granting insert/update/delete policies to the authenticated/anon roles.

-- ---- Profiles ----
create policy "profiles are public" on public.profiles for select using (true);
create policy "users manage own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- ---- Watch history: private to the user ----
create policy "own watch history" on public.watch_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- Ratings: public read, owner write ----
create policy "ratings are public" on public.ratings for select using (true);
create policy "users manage own ratings" on public.ratings
  for insert with check (auth.uid() = user_id);
create policy "users update own ratings" on public.ratings
  for update using (auth.uid() = user_id);
create policy "users delete own ratings" on public.ratings
  for delete using (auth.uid() = user_id);

-- ---- Reviews: public read, owner write ----
create policy "reviews are public" on public.reviews for select using (true);
create policy "users manage own reviews" on public.reviews
  for insert with check (auth.uid() = user_id);
create policy "users update own reviews" on public.reviews
  for update using (auth.uid() = user_id);
create policy "users delete own reviews" on public.reviews
  for delete using (auth.uid() = user_id);

create policy "reactions are public" on public.review_reactions for select using (true);
create policy "users manage own reactions" on public.review_reactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- Lists: public lists readable by all, private lists owner-only ----
create policy "public lists are readable" on public.lists
  for select using (is_public = true or auth.uid() = user_id);
create policy "users manage own lists" on public.lists
  for insert with check (auth.uid() = user_id);
create policy "users update own lists" on public.lists
  for update using (auth.uid() = user_id);
create policy "users delete own lists" on public.lists
  for delete using (auth.uid() = user_id);

create policy "list items follow list visibility" on public.list_items
  for select using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id
        and (l.is_public = true or l.user_id = auth.uid())
    )
  );
create policy "owner manages list items" on public.list_items
  for all using (
    exists (select 1 from public.lists l where l.id = list_items.list_id and l.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.lists l where l.id = list_items.list_id and l.user_id = auth.uid())
  );

-- ---- Social graph ----
create policy "follows are public" on public.follows for select using (true);
create policy "users manage own follows" on public.follows
  for insert with check (auth.uid() = follower_id);
create policy "users remove own follows" on public.follows
  for delete using (auth.uid() = follower_id);

create policy "activity is public" on public.activity_events for select using (true);
create policy "users write own activity" on public.activity_events
  for insert with check (auth.uid() = user_id);

-- ---- Movie night ----
create policy "participants can view their movie night" on public.movie_nights
  for select using (
    host_id = auth.uid() or
    exists (select 1 from public.movie_night_participants p where p.movie_night_id = id and p.user_id = auth.uid())
  );
create policy "host creates movie night" on public.movie_nights
  for insert with check (auth.uid() = host_id);
create policy "host updates movie night" on public.movie_nights
  for update using (auth.uid() = host_id);

create policy "participants visible to participants" on public.movie_night_participants
  for select using (
    exists (
      select 1 from public.movie_night_participants p2
      where p2.movie_night_id = movie_night_participants.movie_night_id and p2.user_id = auth.uid()
    )
  );
create policy "users join movie night as self" on public.movie_night_participants
  for insert with check (auth.uid() = user_id);

-- ---- Taste graph: strictly private to the user ----
create policy "own taste vector" on public.taste_vectors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own taste attributes" on public.taste_attributes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- Billing: strictly private ----
create policy "own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);
-- Inserts/updates to subscriptions happen only via the Stripe webhook using the
-- service_role key, which bypasses RLS by design — no write policy for authenticated users.
