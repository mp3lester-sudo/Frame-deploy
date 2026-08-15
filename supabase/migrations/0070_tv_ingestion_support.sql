-- TV ingestion (Phase 2, task: "begin to import TV shows"): tmdb_id was
-- unique on its own, but TMDB's movie-id and tv-id numbering are
-- independent counters that collide fairly often -- e.g. movie id 1396
-- is "Sneakers" (1992), tv id 1396 is "Breaking Bad". Ingesting a TV
-- show whose numeric tmdb_id happens to match an existing movie's would
-- upsert ON CONFLICT (tmdb_id) onto that movie's row and silently
-- corrupt it (wrong type, wrong everything) rather than insert a new
-- row. Scoping uniqueness to (tmdb_id, type) instead lets both ids
-- coexist as two separate rows -- ingest-tmdb.ts's upsert is updated in
-- this same change to conflict on "tmdb_id,type" instead of "tmdb_id"
-- alone.
alter table public.titles drop constraint if exists titles_tmdb_id_key;
alter table public.titles add constraint titles_tmdb_id_type_key unique (tmdb_id, type);
