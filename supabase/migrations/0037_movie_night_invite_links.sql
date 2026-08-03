-- Movie Night shareable invite links.
--
-- Today, inviting someone to a Movie Night only works by username -- both
-- host and invitee have to already be Backlot accounts (see
-- inviteToMovieNight in src/lib/actions/movie-night.ts). That means the
-- feature can never pull in someone new: there's no link a host can hand
-- to a friend who isn't on the app yet. This adds that link, alongside the
-- existing by-username invite (which still works great for inviting
-- people you already know are on Backlot).

alter table public.movie_nights add column invite_token text;

-- Backfill existing sessions so old Movie Nights also get a working link,
-- same "derive a one-time value from something already unique" trick used
-- for profiles.referral_code in 0036_growth_features.sql.
update public.movie_nights
set invite_token = lower(substr(md5(id::text || 'mn'), 1, 10))
where invite_token is null;

alter table public.movie_nights alter column invite_token set not null;
-- Default so every future insert (createMovieNight, any script, direct
-- SQL) gets a token automatically -- no application-side generate/retry
-- loop needed, unlike referral_code, since collisions here are
-- astronomically unlikely off gen_random_uuid() and this app already
-- leans on pgcrypto's gen_random_uuid() for every table's id column.
alter table public.movie_nights alter column invite_token
  set default lower(substr(md5(gen_random_uuid()::text), 1, 10));
create unique index movie_nights_invite_token_idx on public.movie_nights(invite_token);

-- Resolves an invite link to a movie_night id for an *authenticated* user
-- who wants to join. security definer because the caller isn't a
-- participant yet, so movie_nights' own "participants can view their
-- movie night" RLS policy (0002_rls.sql) would otherwise hide the row
-- entirely -- this deliberately exposes only the id/host_id via a token
-- lookup, nothing else about the session's candidates or votes. Only
-- resolves sessions still collecting picks; joining a decided or
-- cancelled one wouldn't do anything useful anyway.
create or replace function public.resolve_movie_night_token(p_token text)
returns table (id uuid, host_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select id, host_id from public.movie_nights
  where invite_token = p_token and status = 'collecting';
$$;

grant execute on function public.resolve_movie_night_token(text) to authenticated;

-- Public preview for a *logged-out* visitor who clicked an invite link --
-- enough to make joining feel worth it (who's hosting, who's already in,
-- how many people) without exposing the actual candidate pool or votes,
-- which stay participant-only. security definer for the same RLS reason
-- as above, but callable by the anon role too since this is the one
-- Movie Night surface meant to work before signup.
create or replace function public.movie_night_preview(p_token text)
returns table (
  status text,
  host_username text,
  host_display_name text,
  host_avatar_url text,
  participant_count int,
  participant_avatars text[]
)
language sql
security definer
set search_path = public
stable
as $$
  select
    mn.status,
    hp.username,
    hp.display_name,
    hp.avatar_url,
    (select count(*) from public.movie_night_participants p where p.movie_night_id = mn.id)::int,
    (
      select coalesce(array_agg(p.avatar_url) filter (where p.avatar_url is not null), '{}')
      from (
        select pr.avatar_url from public.movie_night_participants mnp
        join public.profiles pr on pr.id = mnp.user_id
        where mnp.movie_night_id = mn.id
        order by mnp.joined_at
        limit 6
      ) p
    )
  from public.movie_nights mn
  join public.profiles hp on hp.id = mn.host_id
  where mn.invite_token = p_token;
$$;

grant execute on function public.movie_night_preview(text) to anon, authenticated;
