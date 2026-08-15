-- TV modernization pass, part 1: the /tv/{id} TMDB details response has
-- always included created_by, number_of_seasons, number_of_episodes,
-- in_production, status, and next_episode_to_air -- ingest-tmdb.ts fetches
-- this response for every TV title already (append_to_response=credits)
-- but has been discarding all of these fields since TV ingestion first
-- shipped (see the comment above ingestOne: "a dedicated creator/showrunner
-- credit type is a follow-up, not part of this first pass"). This is that
-- follow-up.

alter table public.titles add column if not exists number_of_seasons integer;
alter table public.titles add column if not exists number_of_episodes integer;
alter table public.titles add column if not exists in_production boolean;
-- TMDB's raw values: "Returning Series", "Planned", "In Production",
-- "Ended", "Canceled", "Pilot". Stored as-is rather than remapped to a
-- smaller enum -- Discover's "currently airing" filter only needs
-- in_production, and the raw value is more informative to show directly
-- on a title page than anything we'd gain from collapsing it.
alter table public.titles add column if not exists tv_status text;
alter table public.titles add column if not exists next_episode_air_date date;

-- 'creator' is TMDB's created_by / showrunner credit -- deliberately kept
-- separate from 'director' (see ingest-tmdb.ts's original comment: a
-- showrunner is not what "Director" means anywhere else in this app --
-- Director of the Day, diversify.ts's same-director exclusion, the
-- embedding input's "Director: ..." line -- mislabeling one as the other
-- would quietly corrupt those movie-scoped features). Creator Spotlight
-- (the TV-mode analog of Director of the Day) reads this credit type
-- exclusively.
alter table public.title_credits drop constraint if exists title_credits_credit_type_check;
alter table public.title_credits add constraint title_credits_credit_type_check
  check (credit_type in ('director', 'writer', 'composer', 'actor', 'cinematographer', 'creator'));

-- Currently-airing badge / filter: partial index since only a minority of
-- TV titles are actively in production at any given time.
create index if not exists titles_in_production_idx on public.titles (in_production) where type = 'tv' and in_production = true;
