-- 1:1 direct messages. Each pair of users has at most one conversation —
-- enforced by canonically ordering the two participant columns (user_a <
-- user_b, matching src/lib/messages/pair.ts's orderPair()) plus a unique
-- constraint on the pair, so it doesn't matter who starts it.
--
-- No realtime/websocket wiring here (this app doesn't use Supabase Realtime
-- anywhere yet) — messages appear on page load/refresh, same
-- request/response model as the rest of Frame.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_ordered_pair check (user_a < user_b),
  constraint conversations_unique_pair unique (user_a, user_b)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index conversations_user_a_idx on public.conversations(user_a);
create index conversations_user_b_idx on public.conversations(user_b);
create index messages_conversation_idx on public.messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "users see their own conversations" on public.conversations
  for select using (auth.uid() = user_a or auth.uid() = user_b);
create policy "users start conversations they're part of" on public.conversations
  for insert with check (auth.uid() = user_a or auth.uid() = user_b);

create policy "users see messages in their conversations" on public.messages
  for select using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));
create policy "users send messages in their conversations" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );
create policy "users mark messages read in their conversations" on public.messages
  for update using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- RLS policies apply per-row, not per-column — without this, the update
-- policy above (needed so a recipient can mark a message read) would also
-- let them rewrite the body/sender_id of a message they didn't send. Column
-- grants close that gap: only read_at is updatable at all.
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;
