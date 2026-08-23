-- Follow-up to 0080. That migration restructured the KNN search into its
-- own step so Postgres COULD use the ivfflat index -- but live EXPLAIN
-- ANALYZE after 0080 shipped still showed 15-22 seconds. The index isn't
-- missing (0080's diagnostics confirmed title_embeddings_ivfflat_idx
-- exists); the planner is choosing a sequential scan over it anyway.
-- Forcing enable_seqscan off for the same call cut it to ~3.5 seconds --
-- confirmation that the index path genuinely is faster on this project's
-- (Free tier) compute, the planner's cost model was just misjudging it.
-- This is a known, standard workaround for exactly this situation:
-- disabling seqscan for the scope of one query to force the intended
-- index-assisted plan. set_config's third argument (true) scopes it to
-- the current transaction only, so it never affects any other query on
-- the connection.
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
  perform set_config('enable_seqscan', 'off', true);

  select embedding into v_taste_vector
  from public.taste_vectors
  where user_id = p_user_id and media_type = p_media_type;

  if v_taste_vector is null then
    return;
  end if;

  -- Capped independent of p_match_count -- engine.ts's
  -- CANDIDATE_POOL_MULTIPLIER means callers can ask for up to ~160 at
  -- once, and a bigger pool costs roughly linear extra time even with
  -- the index forced on. This bounds worst-case latency instead of
  -- letting it scale with the caller's request size.
  v_pool_size := least(greatest(p_match_count * 15, 800), 3000);

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
