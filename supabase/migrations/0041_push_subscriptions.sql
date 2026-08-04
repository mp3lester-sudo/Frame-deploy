-- Web Push subscriptions -- lets the app deliver real push notifications
-- (shown by the OS/browser even when the app is closed or backgrounded)
-- instead of relying solely on the in-app notifications bell and Resend
-- re-engagement email. One row per browser/device a user has opted into
-- push on, since a person can have several (phone + laptop, etc.) and all
-- of them should get notified.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  -- Re-subscribing (e.g. the browser rotated the endpoint) should update
  -- the existing row for that user+endpoint pair rather than erroring or
  -- accumulating duplicates.
  unique (user_id, endpoint)
);

create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A user only ever manages their OWN subscription rows via the client-
-- facing subscribe/unsubscribe actions (src/lib/actions/push.ts). The
-- SEND path (src/lib/push/send-push.ts, invoked from notify() on behalf
-- of some OTHER acting user entirely -- e.g. someone else's follow or
-- Movie Night decision triggering a push to this user) deliberately does
-- NOT go through this policy at all: it reads via the service-role client
-- (same privileged-server-only pattern already used for the Stripe
-- webhook and rate limiting), since an "auth.uid() = user_id" policy
-- would make the actor unable to read the recipient's subscriptions to
-- push to them, mirroring the exact reasoning behind notifications'
-- actor-keyed insert policy.
create policy "users manage their own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
