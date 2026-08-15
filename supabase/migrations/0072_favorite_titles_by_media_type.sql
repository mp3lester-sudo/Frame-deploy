-- Personal Pyramid (favorite_titles) is the other place a Movies/Shows
-- profile currently shares state that should be independent: one flat
-- top-6 list per user (migration 0010/0025), no type awareness. Under
-- "fully separate profiles" a user needs one Pyramid for movies and a
-- completely separate one for shows -- picking a #1 favorite show can't
-- bump a favorite movie out of position 3, and vice versa.

alter table public.favorite_titles add column if not exists media_type text;

-- Backfill: look up each existing favorite's real type from titles
-- rather than assuming 'movie' -- favorite_titles predates the TV
-- catalogue entirely, but backfilling from the actual row is free and
-- more correct than a blanket default.
update public.favorite_titles ft
set media_type = t.type
from public.titles t
where ft.title_id = t.id and ft.media_type is null;

-- Any favorite whose title_id somehow didn't resolve (orphaned row) --
-- default to 'movie' rather than leaving a null that would violate the
-- not-null/check constraints below.
update public.favorite_titles set media_type = 'movie' where media_type is null;

alter table public.favorite_titles alter column media_type set not null;
alter table public.favorite_titles add constraint favorite_titles_media_type_check check (media_type in ('movie', 'tv'));

-- primary key was (user_id, position) -- one flat 1-6 list per user
-- (migration 0010/0025). Rescope to (user_id, media_type, position) so
-- positions 1-6 exist independently for movies and for shows.
alter table public.favorite_titles drop constraint favorite_titles_pkey;
alter table public.favorite_titles add primary key (user_id, media_type, position);
