-- Ask Backlot (the AI concierge) had no quality gate at all -- neither the
-- SQL candidate search nor the LLM prompt ever checked a title's rating,
-- so a genuinely bad movie could reach the candidate list purely on
-- semantic similarity to the request and get recommended. It was also
-- hard-capped at 12 raw candidates and 3 final picks regardless of how
-- broad the request was, so a genre-level ask like "psychological
-- thrillers" got the same tiny handful as a narrow, specific one.
--
-- Fix: match_titles_by_query gains the same weighted_rating floor + join
-- pattern used to gate quality everywhere else in the app (see
-- hidden-gem.ts's MIN_WEIGHTED_RATING, quality-weighting.ts's
-- CATALOGUE_AVERAGE_RATING of 7.2 from 0009_weighted_rating.sql) --
-- p_min_weighted_rating defaults to 7.3, just above the catalogue mean, so
-- only above-average-or-better titles are even eligible to be a
-- candidate. weighted_rating is a Bayesian average that already discounts
-- thin vote counts toward that same mean, so this isn't just trusting a
-- 9/10 from three people, and titles with no vote history (null
-- weighted_rating) are excluded outright rather than given the benefit of
-- the doubt -- "highly rated" should mean actually vetted, not unknown.
--
-- Also raises the default candidate pool (12 -> 60) so a broad request
-- has enough headroom to return a genuinely large set, and adopts the
-- ivfflat.probes runtime bump (0026's fix) since this function now
-- combines a WHERE filter with the ANN search -- at the default 1 probe,
-- filtering candidates down by rating after an under-probed search could
-- silently starve the pool even when 60 qualifying matches exist in the
-- catalogue.
create or replace function public.match_titles_by_query(
  p_embedding vector(1536),
  p_match_count int default 60,
  p_min_weighted_rating numeric default 7.3
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
  order by te.embedding <=> p_embedding asc
  limit p_match_count;
end;
$$;
