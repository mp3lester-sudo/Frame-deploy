-- Taste — Phase 6: Recommendation Engine support functions
-- Vector search + collaborative signal live in Postgres so a single round
-- trip returns ranked candidates; the app layer only handles blending/reason
-- generation (see src/lib/recommendations/engine.ts).

create or replace function public.match_titles_for_user(
  p_user_id uuid,
  p_match_count int default 20,
  p_exclude_watched boolean default true
)
returns table (
  title_id uuid,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    te.title_id,
    1 - (te.embedding <=> tv.embedding) as similarity
  from public.title_embeddings te
  cross join public.taste_vectors tv
  where tv.user_id = p_user_id
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

-- Collaborative signal: titles loved by users whose taste vector is close to
-- the target user's, weighted by how close those users are.
create or replace function public.similar_users_liked(
  p_user_id uuid,
  p_match_count int default 20
)
returns table (
  title_id uuid,
  score float
)
language plpgsql
stable
as $$
begin
  return query
  with target as (
    select embedding from public.taste_vectors where user_id = p_user_id
  ),
  neighbors as (
    select tv.user_id, 1 - (tv.embedding <=> target.embedding) as closeness
    from public.taste_vectors tv, target
    where tv.user_id <> p_user_id
    order by tv.embedding <=> target.embedding asc
    limit 200
  )
  select r.title_id, sum((r.score / 5.0) * n.closeness) as score
  from public.ratings r
  join neighbors n on n.user_id = r.user_id
  where r.score >= 4.0
    and not exists (
      select 1 from public.watch_history wh
      where wh.user_id = p_user_id and wh.title_id = r.title_id
    )
  group by r.title_id
  order by score desc
  limit p_match_count;
end;
$$;

-- Incrementally folds a new rating into the user's taste vector as a
-- running weighted average, so we never have to recompute from scratch.
create or replace function public.upsert_taste_vector_from_rating(
  p_user_id uuid,
  p_title_id uuid,
  p_score numeric
)
returns void
language plpgsql
as $$
declare
  v_title_embedding vector(1536);
  v_weight float;
  v_existing record;
begin
  select embedding into v_title_embedding from public.title_embeddings where title_id = p_title_id;
  if v_title_embedding is null then
    return; -- title not embedded yet; ingestion pipeline will backfill
  end if;

  -- Ratings below 2.5 pull the vector away (negative weight); above push toward it.
  v_weight := (p_score - 2.5) / 2.5;

  select * into v_existing from public.taste_vectors where user_id = p_user_id;

  if v_existing is null then
    insert into public.taste_vectors (user_id, embedding, sample_size)
    values (p_user_id, v_title_embedding * greatest(v_weight, 0.05), 1);
  else
    update public.taste_vectors
    set
      embedding = (
        (v_existing.embedding * v_existing.sample_size) + (v_title_embedding * v_weight)
      ) / (v_existing.sample_size + 1),
      sample_size = v_existing.sample_size + 1,
      updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;
