-- Fix: "infinite recursion detected in policy for relation
-- movie_night_participants" — found via scripts/verify-movie-night-flow.ts.
--
-- The original "participants visible to participants" policy queried
-- movie_night_participants from inside its own USING clause. Postgres has to
-- re-apply that same policy to evaluate the subquery, which re-triggers the
-- subquery, forever. movie_nights' select policy made it worse by querying
-- movie_night_participants too, tripping the same recursion one hop away.
--
-- Fix: move the membership check into a SECURITY DEFINER function. Being
-- security definer, it runs as the (trusted) function owner and isn't
-- re-subjected to the calling role's RLS on the way in, which breaks the
-- self-referential cycle while keeping the exact same access rules.

create or replace function public.is_movie_night_participant(p_movie_night_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.movie_night_participants
    where movie_night_id = p_movie_night_id and user_id = p_user_id
  );
$$;

drop policy if exists "participants visible to participants" on public.movie_night_participants;
create policy "participants visible to participants" on public.movie_night_participants
  for select using (
    public.is_movie_night_participant(movie_night_id, auth.uid())
  );

drop policy if exists "participants can view their movie night" on public.movie_nights;
create policy "participants can view their movie night" on public.movie_nights
  for select using (
    host_id = auth.uid() or
    public.is_movie_night_participant(id, auth.uid())
  );
