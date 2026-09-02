-- URGENT CORRECTIVE FIX to migrations 0092/0093.
--
-- Those two migrations added statement_timeout = 2500ms to similar_titles
-- and match_titles_for_user specifically to stop a proven pathological
-- blowup (observed spiking past 10-23s under an unlucky query vector,
-- see that migration's own comment). That protection was real and
-- necessary. But 2500ms is aggressive relative to what these two RPCs can
-- legitimately need for a long-lived, heavily-used account -- a large
-- taste vector / large candidate pool doing a forced ivfflat probe over a
-- 40k+-title catalogue is real, not-pathological work that can
-- legitimately run a couple seconds past that cutoff on this project's
-- compute tier (see migration 0081's own comment on why the planner
-- under-costs this index here in the first place).
--
-- The failure mode this produces is worse than slow: match_titles_for_user
-- degrading to an empty result on timeout is treated by engine.ts as
-- "this user has no content matches" -- which routes through the exact
-- same self-heal-then-cold-start fallback path as a genuinely new user
-- with no signal at all (see getColdStartRecommendations in engine.ts).
-- For a heavy, long-time account, a too-aggressive DB timeout doesn't
-- just make the page slower -- it can silently swap personalized
-- recommendations for the generic popularity fallback, request after
-- request, with nothing in the UI distinguishing "cold start" from
-- "your real recs, but the query got cut off before it finished."
-- (recommendation_impressions.degraded_signals, added specifically for
-- this blind spot, is the only place this shows up.)
--
-- Raising the DB-side cutoff to 5000ms keeps it well under
-- MATCH_TITLES_TIMEOUT_MS (6000ms, the client-side cap in engine.ts) so a
-- canceled statement still has room to be reported as a real Postgres
-- error rather than racing the client's own timeout, while giving a
-- legitimately-expensive-but-real query roughly double the runway before
-- being treated as broken. Still well short of unbounded, so the original
-- 10-23s pathological-spike risk stays capped.
create or replace function public.similar_titles(
  p_title_id uuid,
  p_match_count int default 8,
  p_media_type text default 'movie'
)
returns table (
  title_id uuid,
  similarity float
)
language plpgsql
stable
as $$
declare
  v_embedding vector(1536);
begin
  perform set_config('ivfflat.probes', '10', true);
  perform set_config('enable_seqscan', 'off', true);
  perform set_config('statement_timeout', '5000', true);

  select te.embedding into v_embedding
  from public.title_embeddings te
  where te.title_id = p_title_id;

  if v_embedding is null then
    return;
  end if;

  return query
  with nearest as materialized (
    select te.title_id, te.embedding <=> v_embedding as dist
    from public.title_embeddings te
    where te.title_id <> p_title_id
    order by te.embedding <=> v_embedding asc
    limit greatest(p_match_count * 10, 200)
  )
  select n.title_id, 1 - n.dist as similarity
  from nearest n
  join public.titles t on t.id = n.title_id
  where t.type = p_media_type
  order by n.dist asc
  limit p_match_count;
end;
$$;

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
  perform set_config('statement_timeout', '5000', true);

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

-- The three scoring/citation RPCs below (similarity_to_disliked_titles,
-- similarity_to_implicit_positive_titles, most_similar_liked_titles_batch)
-- had NO statement_timeout at all before this migration -- unlike
-- match_titles_for_user/similar_titles above, they don't search the whole
-- catalogue via an ANN index, they brute-force a cross join between the
-- candidate pool and this user's own dislike/watchlist/liked history, so
-- their cost scales with (candidates x this user's own history size)
-- rather than catalogue size. Bounded at 5000ms as a backstop against a
-- truly runaway case -- each already degrades gracefully to "no extra
-- signal for this request" on its own client-side withTimeout (3000ms),
-- so losing this RPC to a DB-side cutoff only means those specific soft
-- signals go missing for one request, never a fall-through to the
-- cold-start/popularity path the way match_titles_for_user does -- much
-- lower severity, this closes the same class of gap for consistency and
-- to stop a canceled query from tying up a DB connection past the point
-- the client has already given up on it.
create or replace function public.similarity_to_disliked_titles(
  p_user_id uuid,
  p_title_ids uuid[],
  p_dislike_max_score numeric default 2.5,
  p_media_type text default 'movie'
)
returns table (
  title_id uuid,
  max_similarity float
)
language plpgsql
stable
as $$
declare
  abandon_progress_floor constant double precision := 0.25;
begin
  perform set_config('statement_timeout', '5000', true);

  return query
  with disliked as (
    select te.embedding
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    join public.titles t on t.id = r.title_id
    where r.user_id = p_user_id and r.score <= p_dislike_max_score and t.type = p_media_type
    union
    select te.embedding
    from public.title_dismissals d
    join public.title_embeddings te on te.title_id = d.title_id
    join public.titles t on t.id = d.title_id
    where d.user_id = p_user_id and t.type = p_media_type
    union
    select te.embedding
    from public.watch_sessions ws
    join public.title_embeddings te on te.title_id = ws.title_id
    join public.titles t on t.id = ws.title_id
    where ws.user_id = p_user_id
      and t.type = p_media_type
      and ws.status = 'abandoned'
      and ws.runtime_minutes is not null
      and ws.runtime_minutes > 0
      and ws.accumulated_seconds >= abandon_progress_floor * ws.runtime_minutes * 60
      and not exists (select 1 from public.ratings r2 where r2.user_id = p_user_id and r2.title_id = ws.title_id)
      and not exists (select 1 from public.favorite_titles ft where ft.user_id = p_user_id and ft.title_id = ws.title_id)
      and not exists (
        select 1 from public.reviews rv
        where rv.user_id = p_user_id and rv.title_id = ws.title_id and rv.inferred_score is not null
      )
  ),
  candidates as (
    select te.title_id, te.embedding
    from public.title_embeddings te
    where te.title_id = any(p_title_ids)
  )
  select c.title_id, coalesce(max(1 - (c.embedding <=> d.embedding)), 0)::float as max_similarity
  from candidates c
  left join disliked d on true
  group by c.title_id;
end;
$$;

create or replace function public.similarity_to_implicit_positive_titles(
  p_user_id uuid,
  p_title_ids uuid[]
)
returns table (
  title_id uuid,
  max_similarity_watchlist float,
  max_similarity_watched_unrated float
)
language plpgsql
stable
as $$
begin
  perform set_config('statement_timeout', '5000', true);

  return query
  with watchlist_positive as (
    select te.embedding
    from public.watchlist w
    join public.title_embeddings te on te.title_id = w.title_id
    where w.user_id = p_user_id
  ),
  watched_unrated_positive as (
    select te.embedding
    from public.watch_history wh
    join public.title_embeddings te on te.title_id = wh.title_id
    where wh.user_id = p_user_id
      and not exists (
        select 1 from public.ratings r
        where r.user_id = wh.user_id and r.title_id = wh.title_id
      )
  ),
  candidates as (
    select te.title_id, te.embedding
    from public.title_embeddings te
    where te.title_id = any(p_title_ids)
  )
  select
    c.title_id,
    coalesce(max(1 - (c.embedding <=> wp.embedding)), 0)::float as max_similarity_watchlist,
    coalesce(max(1 - (c.embedding <=> wu.embedding)), 0)::float as max_similarity_watched_unrated
  from candidates c
  left join watchlist_positive wp on true
  left join watched_unrated_positive wu on true
  group by c.title_id;
end;
$$;

create or replace function public.most_similar_liked_titles_batch(
  p_user_id uuid,
  p_title_ids uuid[],
  p_min_similarity float default 0.78,
  p_media_type text default 'movie'
)
returns table (title_id uuid, cited_title_id uuid, similarity float)
language plpgsql
stable
as $$
begin
  perform set_config('statement_timeout', '5000', true);

  return query
  select c.title_id, l.title_id as cited_title_id, l.similarity
  from unnest(p_title_ids) as c(title_id)
  join public.title_embeddings te0 on te0.title_id = c.title_id
  cross join lateral (
    select r.title_id, 1 - (te.embedding <=> te0.embedding) as similarity
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    join public.titles t on t.id = r.title_id
    where r.user_id = p_user_id
      and r.score >= 4.0
      and r.title_id <> c.title_id
      and t.type = p_media_type
      and 1 - (te.embedding <=> te0.embedding) >= p_min_similarity
    order by te.embedding <=> te0.embedding asc
    limit 2
  ) as l;
end;
$$;

-- The abandoned-session arm above filters watch_sessions by (user_id,
-- status = 'abandoned'), but the only existing index on this table
-- (migration 0089) is a partial index scoped to status in
-- ('playing','paused') for a different query (Continue Watching). This
-- gives the abandoned-session lookup its own index instead of falling
-- back to scanning every abandoned/completed session in the table.
create index if not exists watch_sessions_user_abandoned_idx
  on public.watch_sessions (user_id)
  where status = 'abandoned';
