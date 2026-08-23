-- Follow-up to 0077. That migration fixed match_titles_for_user ordering
-- by a bound plpgsql variable instead of a joined column (the classic
-- "index can't be used" mistake), but live EXPLAIN ANALYZE after 0077 was
-- applied still showed a Seq Scan on title_embeddings taking 7-22+
-- seconds on this project's compute tier -- the ivfflat index
-- (title_embeddings_ivfflat_idx) exists and IS a bound-variable ORDER BY
-- now, but the function still joined title_embeddings to titles (plus
-- three NOT EXISTS exclusion subqueries) BEFORE the ORDER BY + LIMIT.
-- Postgres cannot push a LIMIT through a join, so it has no choice but to
-- materialize the full joined+filtered result set and sort all of it --
-- the ivfflat index's actual advantage (stop scanning once N nearest
-- neighbors are found) never gets a chance to apply.
--
-- Fix: pull the nearest-neighbor pool as its own step, querying
-- title_embeddings alone with nothing else in the FROM clause, so
-- Postgres can use the index's native "scan in distance order, stop at
-- LIMIT" plan. Only after that (now small, ~2-8k row) pool is materialized
-- do we join to titles and apply the exclusion filters -- cheap per-row
-- checks over a few thousand rows instead of the full ~20k-embedding
-- table. `materialized` forces Postgres to actually run the pool query to
-- completion first rather than inlining it into the outer join (which
-- would reintroduce the exact same problem this migration fixes).
create or replace function public.match_titles_for_user(
  p_user_id uuid,
  p_match_count int default 20,
  p_exclude_watched boolean default true,
  p_min_similarity float default 0.2,
  p_media_type text default 'movie'
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
declare
  v_taste_vector vector(1536);
  v_pool_size int;
begin
  perform set_config('ivfflat.probes', '10', true);

  select embedding into v_taste_vector
  from public.taste_vectors
  where user_id = p_user_id and media_type = p_media_type;

  if v_taste_vector is null then
    return;
  end if;

  -- Generous enough that, even after the media_type filter and the three
  -- exclusion checks below strip some rows out, there's still comfortably
  -- more than p_match_count left. Callers ask for up to ~160 at once
  -- (engine.ts's CANDIDATE_POOL_MULTIPLIER), so this scales with that.
  v_pool_size := greatest(p_match_count * 50, 2000);

  return query
  with nearest as materialized (
    select te.title_id, te.embedding <=> v_taste_vector as dist
    from public.title_embeddings te
    order by te.embedding <=> v_taste_vector asc
    limit v_pool_size
  )
  select
    n.title_id,
    1 - n.dist as similarity
  from nearest n
  join public.titles t on t.id = n.title_id
  where t.type = p_media_type
    and (1 - n.dist) >= p_min_similarity
    and (
      not p_exclude_watched
      or not exists (
        select 1 from public.watch_history wh
        where wh.user_id = p_user_id and wh.title_id = n.title_id
      )
    )
    and not exists (
      select 1 from public.favorite_titles ft
      where ft.user_id = p_user_id and ft.title_id = n.title_id
    )
    and not exists (
      select 1 from public.reviews r
      where r.user_id = p_user_id and r.title_id = n.title_id
    )
  order by n.dist asc
  limit p_match_count;
end;
$$;
