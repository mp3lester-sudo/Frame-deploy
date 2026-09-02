-- Ask Slate perf: match_titles_by_query (the catalogue-wide ANN search
-- behind every Ask Slate request) was never given the same
-- enable_seqscan-off + statement_timeout treatment as similar_titles/
-- match_titles_for_user (migrations 0092-0094) -- it only ever set
-- ivfflat.probes. Per migration 0081's own finding, this project's
-- compute tier under-costs the ivfflat index relative to a sequential
-- scan for this catalogue size, so without enable_seqscan=off forcing
-- the planner's hand, Postgres can silently fall back to scanning every
-- row in title_embeddings (joined against titles, filtered by rating/
-- year/media_type) instead of using the index at all -- on every single
-- Ask Slate query, not just an unlucky one. This is very likely a bigger
-- contributor to Ask Slate's reported ~4s latency than the two OpenAI
-- calls (embedding + chat completion) it also makes, since those are
-- fundamentally bounded by model inference time while an accidental
-- full table scan is not bounded by anything.
--
-- Forcing the index scan without a statement_timeout would reintroduce
-- the exact unbounded-worst-case risk migration 0092 fixed for
-- similar_titles, so both changes ship together here, same as every
-- other RPC in this family.
create or replace function public.match_titles_by_query(
  p_embedding vector(1536),
  p_match_count int default 60,
  p_min_weighted_rating numeric default 7.3,
  p_min_release_year int default null,
  p_max_release_year int default null,
  p_media_type text default null
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
  perform set_config('enable_seqscan', 'off', true);
  perform set_config('statement_timeout', '5000', true);

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
    and (p_media_type is null or t.type = p_media_type)
  order by te.embedding <=> p_embedding asc
  limit p_match_count;
end;
$$;

-- find_titles_mentioned_in_query runs BEFORE anything else in
-- askConcierge (see resolveYearWindow in concierge.ts) -- it's awaited
-- on its own, sequentially, ahead of the Promise.all that kicks off the
-- embedding call, so its cost is 100% additive to every single Ask Slate
-- request's total latency, never hidden behind something else already in
-- flight. As written, it does `p_query ilike '%' || t.name || '%'` --
-- checking whether the user's query string contains each catalogue
-- title's name as a substring -- against effectively every row in
-- titles (length(name) >= 2 excludes almost nothing). A leading-wildcard
-- ILIKE can't use a standard btree index, so this is a full-table pattern
-- match on every request regardless of catalogue size.
--
-- Adding `length(t.name) <= length(p_query)` prunes this correctly and
-- cheaply before any string comparison happens: a title name longer than
-- the entire user query can never appear as a substring of it, so this
-- can only ever remove impossible candidates, never a real match. For a
-- short, typical query ("something like Inception but slower") against a
-- catalogue where most titles are longer than that, this should prune
-- the large majority of rows via a cheap length check before the
-- expensive pattern match ever runs on them. Also adds a statement_timeout
-- backstop consistent with every other RPC in this file, in case an
-- unusually long pasted query still leaves a large candidate set.
create or replace function public.find_titles_mentioned_in_query(p_query text)
returns table (
  id uuid,
  name text,
  release_date date
)
language sql
stable
set statement_timeout = '3000'
as $$
  select t.id, t.name, t.release_date
  from public.titles t
  where length(t.name) >= 2
    and length(t.name) <= length(p_query)
    and p_query ilike '%' || replace(replace(t.name, '%', '\%'), '_', '\_') || '%'
  order by length(t.name) desc
  limit 20;
$$;
