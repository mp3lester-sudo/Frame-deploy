-- Per-type push notification preferences -- previously the only control
-- was PushToggle's single global on/off switch (subscribe/unsubscribe
-- this browser entirely). This adds the finer-grained "turn off Movie
-- Night pings but keep follows" control real users expect, without
-- touching the underlying push subscription itself.
--
-- Opt-OUT model: no row for a (user, type) pair means enabled (matches
-- the behavior every existing subscriber already has today -- shipping
-- this with an opt-IN default would silently go quiet for everyone until
-- they visited Settings). "payment_failed" is deliberately not offered as
-- a togglable row anywhere in the app (see sendPushToUser call sites) --
-- it's the one push type where going silent has a real financial
-- consequence for the person.
create table public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('follow', 'comment', 'reaction', 'movie_night_invite', 'movie_night_decided')),
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

alter table public.notification_preferences enable row level security;

create policy "users manage their own notification preferences" on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
