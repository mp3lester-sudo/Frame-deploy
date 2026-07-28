-- Fix: inviting someone to a movie night means the HOST inserts a
-- movie_night_participants row on the invitee's behalf (auth.uid() = host,
-- not the invitee). The original "users join movie night as self" policy
-- only allowed auth.uid() = user_id, which covers the host joining their
-- own night but blocked the actual invite flow. Found via
-- scripts/verify-movie-night-flow.ts against the real database.
--
-- Adds a second insert policy for the host case; Postgres OR's multiple
-- permissive policies together, so self-join and host-invites both work.

create policy "host invites participants" on public.movie_night_participants
  for insert with check (
    exists (
      select 1 from public.movie_nights mn
      where mn.id = movie_night_id and mn.host_id = auth.uid()
    )
  );
