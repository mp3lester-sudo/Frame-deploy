-- Favorites are moving from a 4-poster row to a 6-poster 3-2-1 podium.
-- The app-level zod schema was already bumped to max 6, but this table-level
-- check constraint (from 0010_profile_editing.sql) still caps position at 4
-- and was silently rejecting inserts for positions 5 and 6.
alter table public.favorite_titles drop constraint favorite_titles_position_check;
alter table public.favorite_titles add constraint favorite_titles_position_check check (position between 1 and 6);
