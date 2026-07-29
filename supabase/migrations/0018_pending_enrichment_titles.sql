-- scripts/enrich-titles.ts previously determined "which titles still need
-- AI enrichment" by pulling the ENTIRE titles table and the ENTIRE
-- title_embeddings table into JS (paginated in 1000-row chunks each) and
-- diffing them client-side. That was fine at ~4k titles but became a ~40+
-- request round-trip tax on every single script invocation once the
-- catalogue grew to ~36.5k (see 0017-era ingest-tmdb.ts expansion) — most of
-- a 45s run was being spent just computing the pending list, not enriching.
--
-- This replaces that with a single indexed anti-join done in Postgres,
-- returning only the page of titles actually needed, ordered by TMDB
-- popularity so the most-likely-to-matter titles (the ones users will
-- actually search for or get recommended) get enriched first.
create or replace function public.pending_enrichment_titles(p_limit int)
returns table (
  id uuid,
  name text,
  overview text,
  genres text[]
)
language sql
stable
as $$
  select t.id, t.name, t.overview, t.genres
  from public.titles t
  where not exists (
    select 1 from public.title_embeddings te where te.title_id = t.id
  )
  order by t.popularity desc nulls last
  limit p_limit;
$$;

grant execute on function public.pending_enrichment_titles(int) to service_role;
