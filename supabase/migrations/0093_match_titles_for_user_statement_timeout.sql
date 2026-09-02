-- Perf: bound match_titles_for_user's worst-case latency the same way
-- migration 0092 just bounded similar_titles.
--
-- match_titles_for_user is the single most-called recommendation RPC in
-- the app -- engine.ts (home page's main rec engine, already documented
-- as "the single most expensive call in the app"), signature-pick.ts
-- (Taste DNA + home page signature pick), hidden-gem.ts (home page hidden
-- gem), and movie-night.ts (group blending) all call it directly.
--
-- It forces enable_seqscan off + ivfflat.probes=10 (migration 0081) for
-- the exact same reason similar_titles does (0086): the planner
-- under-costs the ivfflat index on this project's compute tier and picks
-- a sequential scan without the nudge. 0092's live tracing just proved
-- that pattern -- forced index scan, no seqscan fallback -- can blow up
-- to 10+ seconds for an unlucky query vector on similar_titles. This
-- function runs the identical shape of KNN query (order by embedding
-- distance, materialized CTE, limited pool) against the same
-- title_embeddings table, so it carries the same risk, on a much hotter
-- path.
--
-- Every caller already handles a thrown/errored RPC as a soft failure:
-- engine.ts, signature-pick.ts, hidden-gem.ts, and movie-night.ts all sit
-- behind try/catch or optional-chaining fallbacks (empty pool -> that
-- section simply doesn't render, exactly like every other soft-failed
-- signal in this codebase) -- so a canceled statement needs no new
-- error-handling path here either.
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
  perform set_config('statement_timeout', '2500', true);

  select embedding into v_taste_vector
  from public.taste_vectors
  where user_id = p_user_id and media_type = p_media_type;

  if v_taste_vector is null then
    return;
  end if;

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
