-- Flat (non-threaded) comments on a review — matches Letterboxd's own
-- comment model, which doesn't nest replies either.
create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index review_comments_review_idx on public.review_comments(review_id);

alter table public.review_comments enable row level security;

create policy "comments are public" on public.review_comments for select using (true);
create policy "users insert own comments" on public.review_comments
  for insert with check (auth.uid() = user_id);
create policy "users delete own comments" on public.review_comments
  for delete using (auth.uid() = user_id);
