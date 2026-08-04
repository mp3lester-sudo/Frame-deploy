-- Content moderation: reports + user blocks. Neither existed before this
-- migration despite reviews, comments, DMs, and club posts all being live
-- user-generated content with no way to flag or escape abuse.

-- Reportable content types are kept as a single polymorphic table
-- (content_type + content_id) rather than a separate reports_reviews /
-- reports_comments / etc. table per content type, since the shape of a
-- report (reporter, reason, optional note, status) is identical regardless
-- of what's being reported, and adding a new reportable surface later
-- shouldn't require a new migration.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('review', 'review_comment', 'message', 'club_post', 'profile')),
  content_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'hate_speech', 'sexual_content', 'spoilers', 'other')),
  note text check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create index reports_content_idx on public.reports(content_type, content_id);
create index reports_status_idx on public.reports(status);

alter table public.reports enable row level security;

-- A one-way mailbox from the reporter's side: you can see your own reports
-- (e.g. to show "reported" state in the UI) but not anyone else's report of
-- you or of other content. There's intentionally no "moderators can read
-- everything" policy here -- reviewing open reports is an admin operation
-- and should go through the service role client (same pattern as the
-- Stripe webhook, which is the only writer of subscriptions), not RLS.
create policy "users insert own reports" on public.reports
  for insert with check (auth.uid() = reporter_id);
create policy "users view own reports" on public.reports
  for select using (auth.uid() = reporter_id);

-- Blocking: directional (blocker -> blocked). One table backs both
-- content-hiding (feed/comments queries can anti-join against this) and,
-- if wired into the DM action later, preventing new messages from someone
-- you've blocked.
create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

-- Blocks are private to the blocker -- unlike follows, there's no reason
-- the blocked user (or anyone else) should be able to see who's blocked
-- them via a public select policy.
create policy "users view own blocks" on public.user_blocks
  for select using (auth.uid() = blocker_id);
create policy "users create own blocks" on public.user_blocks
  for insert with check (auth.uid() = blocker_id);
create policy "users remove own blocks" on public.user_blocks
  for delete using (auth.uid() = blocker_id);
