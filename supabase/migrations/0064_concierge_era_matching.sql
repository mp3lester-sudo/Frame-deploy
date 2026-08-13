-- Ask Backlot: when a request names a specific movie ("movies like X"),
-- recommendations should stay within a few years of X's era unless the
-- user opts out (see the matchEra toggle in concierge.ts / the /ai page).
--
-- Two pieces:
--
-- 1. find_titles_mentioned_in_query -- a name lookup independent of the
--    weighted_rating quality floor. The movie someone names as a taste
--    anchor doesn't need to clear Backlot's own recommendation bar just
--    to anchor a year window -- match_titles_by_query (0063) already
--    excludes anything below that floor from the *candidate* pool, which
--    would silently make this lookup fail for a well-known but not
--    critically-acclaimed reference. Broad ILIKE net (any title whose
--    name appears as a substring of the query, longest name first, since
--    a longer match is a more specific/confident one); the caller applies
--    the precise word-boundary/short-title safety check from
--    title-mention.ts's queryMentionsTitle to the results rather than
--    needing this to be perfectly precise in SQL. `%`/`_` in a title name
--    are escaped since they're used here as the ILIKE *pattern*, not the
--    subject -- a literal percent sign in a title would otherwise act as
--    a wildcard.
--
-- 2. match_titles_by_query gains optional release-year bounds, applied
--    the same way the weighted_rating floor was added in 0063 (a WHERE
--    clause on the existing ANN search, ivfflat.probes already bumped by
--    that migration). Null bounds (the default) mean no constraint, so
--    every existing caller is unaffected.
create or replace function public.find_titles_mentioned_in_query(p_query text)
returns table (
  id uuid,
  name text,
  release_date date
)
language sql
stable
as $$
  select t.id, t.name, t.release_date
  from public.titles t
  where length(t.name) >= 2
    and p_query ilike '%' || replace(replace(t.name, '%', '\%'), '_', '\_') || '%'
  order by length(t.name) desc
  limit 20;
$$;

create or replace function public.match_titles_by_query(
  p_embedding vector(1536),
  p_match_count int default 60,
  p_min_weighted_rating numeric default 7.3,
  p_min_release_year int default null,
  p_max_release_year int default null
)
returns table (
  title_id uuid,
  similarity float
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('ivfflat.probes', '10', true);

  return query
  select
    te.title_id,
    1 - (te.embedding <=> p_embedding) as similarity
  from public.title_embeddings te
  join public.titles t on t.id = te.title_id
  where t.weighted_rating is not null
    and t.weighted_rating >= p_min_weighted_rating
    and (p_min_release_year is null or extract(year from t.release_date) >= p_min_release_year)
    and (p_max_release_year is null or extract(year from t.release_date) <= p_max_release_year)
  order by te.embedding <=> p_embedding asc
  limit p_match_count;
end;
$$;
