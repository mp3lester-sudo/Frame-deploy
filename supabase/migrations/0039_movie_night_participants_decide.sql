-- Movie Night is moving to a "match is the decision" model: a unanimous
-- match auto-decides the night the instant the last needed "like" comes
-- in, from whichever participant casts it (not just the host). The
-- fallback "most liked so far" tie-break also becomes available to any
-- participant, not just the host.
--
-- movie_nights currently has exactly one UPDATE policy ("host updates
-- movie night", migration 0002), which only allows the host to flip
-- status/decided_title_id. Same RLS gotcha as migration 0034: with RLS
-- enabled and no policy covering a given caller, the UPDATE just matches
-- zero rows -- no error, just a silent no-op. Without this policy, a
-- non-host's vote completing a match (or a non-host tapping the fallback
-- "Lock this in") would appear to do nothing.
--
-- This ADDS a second permissive UPDATE policy; Postgres OR's multiple
-- permissive policies together for the same command, so the host's
-- existing path keeps working unchanged.
create policy "participants decide their movie night" on public.movie_nights
  for update using (
    exists (
      select 1 from public.movie_night_participants p
      where p.movie_night_id = id and p.user_id = auth.uid()
    )
  );
