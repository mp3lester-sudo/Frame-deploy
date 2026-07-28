-- TMDB's own "popularity" metric (view/vote velocity, not just cumulative
-- votes) is a better "most popular" signal than tmdb_rating (which surfaces
-- obscure titles with a handful of 10/10 votes above real blockbusters) or
-- tmdb_vote_count (biased toward old titles that have had years to
-- accumulate votes). Stored separately so Discover/Search can sort by it.
alter table public.titles add column if not exists popularity numeric;

create index if not exists titles_popularity_idx on public.titles (popularity desc nulls last);
