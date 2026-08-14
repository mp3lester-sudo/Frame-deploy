-- Movies/Shows toggle (Marquee, task #518-522): match_titles_for_user is
-- the one RPC every recommendation path funnels through (engine.ts's
-- warm-start scoring), so it's the highest-leverage place to add
-- media-type filtering -- everything downstream of it (candidate pool,
-- diversify, citations) already only ever sees whatever title_ids this
-- returns, so filtering here alone keeps a TV toggle from ever polluting
-- a Movies-mode recommendation or vice versa.
--
-- p_media_type defaults to null (no filter) rather than 'movie', so any
-- existing caller that hasn't been updated to pass it yet keeps its
-- current (pre-toggle) behavior instead of silently losing rows the
-- moment this migration lands -- engine.ts is updated in the same
-- deploy to always pass the active toggle value explicitly.
create or replace function public.match_titles_for_user(
  p_user_id uuid,
  p_match_count int default 20,
  p_exclude_watched boolean default true,
  p_min_similarity float default 0.2,
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

  return query
  select
    te.title_id,
    1 - (te.embedding <=> tv.embedding) as similarity
  from public.title_embeddings te
  cross join public.taste_vectors tv
  join public.titles t on t.id = te.title_id
  where tv.user_id = p_user_id
    and (1 - (te.embedding <=> tv.embedding)) >= p_min_similarity
    and (p_media_type is null or t.type = p_media_type)
    and (
      not p_exclude_watched
      or not exists (
        select 1 from public.watch_history wh
        where wh.user_id = p_user_id and wh.title_id = te.title_id
      )
    )
  order by te.embedding <=> tv.embedding asc
  limit p_match_count;
end;
$$;

-- Index to keep the added `t.type = p_media_type` filter (and any other
-- direct `.eq("type", ...)` query added across the app in this same
-- change) cheap once the catalogue is a real mix of movies and TV rather
-- than 100% movie rows -- right now this is a no-op speed-up (one value
-- in the column), but it's needed the moment TV ingestion actually runs
-- (Phase 2, tracked separately -- needs fresh TMDB/OpenAI/Supabase keys),
-- so landing it now rather than remembering to add it later.
create index if not exists titles_type_idx on public.titles (type);

-- Same p_media_type treatment (default null, so any existing caller keeps
-- its current behavior) for Ask Marquee's embedding search, so a
-- Shows-mode "what should I watch" ask only ever surfaces TV candidates
-- and vice versa -- concierge.ts is updated in this same deploy to always
-- pass the active toggle value explicitly.
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

