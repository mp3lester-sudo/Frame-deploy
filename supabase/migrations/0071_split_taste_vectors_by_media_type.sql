-- "No movies should be bleeding over to the shows toggle" -- Phase 1
-- (migration 0069) made match_titles_for_user's CANDIDATE pool type-aware
-- (t.type = p_media_type), but taste_vectors itself has stayed exactly
-- one row per user since 0001_init.sql: every function that reads it
-- (match_titles_for_user, title_similarity_for_user) cross-joins
-- `taste_vectors tv where tv.user_id = p_user_id` with zero type
-- awareness, so a Shows-mode recommendation is still scored against a
-- vector built from 100% movie ratings the moment the user has ANY movie
-- history -- Phase 1 filtered *what could be recommended*, not *what
-- taste signal did the recommending*. This migration is the actual fix:
-- one taste vector per (user, media_type), fully independent, so a movie
-- rating never moves the Shows vector and vice versa.
--
-- Existing rows all predate TV ingestion (migration 0070, Phase 2) --
-- every one of them was built exclusively from movie ratings, so they
-- backfill as 'movie' rather than being dropped and rebuilt from
-- scratch. Nobody has a 'tv' vector yet; those get created the first
-- time upsert_taste_vector_from_rating or the backfill DO block below
-- runs against a TV rating.

alter table public.taste_vectors add column if not exists media_type text;
update public.taste_vectors set media_type = 'movie' where media_type is null;
alter table public.taste_vectors alter column media_type set not null;
alter table public.taste_vectors add constraint taste_vectors_media_type_check check (media_type in ('movie', 'tv'));

-- user_id was the primary key (one row per user, full stop) -- swap to a
-- composite key so a user can hold one 'movie' row and one 'tv' row side
-- by side. No FK anywhere in the schema references taste_vectors(user_id),
-- so this is safe to do in place.
alter table public.taste_vectors drop constraint taste_vectors_pkey;
alter table public.taste_vectors add primary key (user_id, media_type);

-- Type-scoped core: identical math to the current recompute_taste_vector_
-- for_user (0062 -- squared weight + 2yr recency half-life on the >=3.5
-- "loved" tier, signed-weight fallback over everything when loved is
-- empty), with one addition -- both CTEs now join titles and require
-- t.type = p_media_type, so a Shows recompute only ever sees TV ratings
-- and a Movies recompute only ever sees movie ratings.
create or replace function public.recompute_taste_vector_for_user_for_type(
  p_user_id uuid,
  p_media_type text
)
returns void
language sql
as $$
  with loved as (
    select
      (
        power((r.score - 2.5)::double precision, 2)
        * power(0.5::double precision, extract(epoch from (now() - r.rated_at)) / (730.0 * 86400.0))
      ) as weight,
      (te.embedding::real[])::double precision[] as arr
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    join public.titles t on t.id = r.title_id
    where r.user_id = p_user_id
      and t.type = p_media_type
      and r.score >= 3.5
  ),
  has_loved as (
    select count(*) > 0 as any_loved from loved
  ),
  everything as (
    select
      (
        (r.score - 2.5)::double precision
        * power(0.5::double precision, extract(epoch from (now() - r.rated_at)) / (730.0 * 86400.0))
      ) as weight,
      (te.embedding::real[])::double precision[] as arr
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    join public.titles t on t.id = r.title_id
    where r.user_id = p_user_id
      and t.type = p_media_type
  ),
  contributing as (
    select weight, arr, abs(weight) as norm_weight from loved
    where (select any_loved from has_loved)
    union all
    select weight, arr, abs(weight) as norm_weight from everything
    where not (select any_loved from has_loved)
  ),
  total as (
    select sum(norm_weight) as total_weight, count(*) as n from contributing
  ),
  summed as (
    select ord, sum(arr[ord] * weight) as wsum
    from contributing, generate_subscripts(arr, 1) as ord
    group by ord
  ),
  final_vec as (
    select array_agg(s.wsum / t.total_weight order by s.ord) as vec
    from summed s, total t
    where t.total_weight > 0
  )
  insert into public.taste_vectors (user_id, media_type, embedding, sample_size)
  select p_user_id, p_media_type, (select vec from final_vec)::vector, (select n from total)
  where (select vec from final_vec) is not null
  on conflict (user_id, media_type) do update
  set embedding = excluded.embedding, sample_size = excluded.sample_size, updated_at = now();
$$;

-- Signature unchanged (p_user_id only) so every existing call site --
-- unrateTitle (social.ts), the Letterboxd bulk import (import.ts),
-- claimAnonymousSwipes (auth.ts) -- keeps working with zero code changes.
-- Runs both types; each is its own independent query so a user who only
-- rates movies never pays for (or creates) a 'tv' row, and vice versa.
create or replace function public.recompute_taste_vector_for_user(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform public.recompute_taste_vector_for_user_for_type(p_user_id, 'movie');
  perform public.recompute_taste_vector_for_user_for_type(p_user_id, 'tv');
end;
$$;

-- Hot path (called on every single rating submitted, see rateTitle in
-- social.ts) -- now looks up just the rated title's own type and
-- recomputes only that vector, instead of always rebuilding both
-- (previously harmless since there was only one vector; now would be
-- double the work for no reason on every rating).
create or replace function public.upsert_taste_vector_from_rating(
  p_user_id uuid,
  p_title_id uuid,
  p_score numeric
)
returns void
language plpgsql
as $$
declare
  v_media_type text;
begin
  select type into v_media_type from public.titles where id = p_title_id;
  if v_media_type is null then
    return;
  end if;
  perform public.recompute_taste_vector_for_user_for_type(p_user_id, v_media_type);
end;
$$;

-- match_titles_for_user: p_media_type (0069) already scoped the
-- CANDIDATE pool by type -- this closes the other half by scoping the
-- taste_vectors join too, so a Shows-mode call reads the 'tv' vector
-- specifically instead of whichever single row used to exist. Defaults
-- to 'movie' (matches every pre-toggle caller's real behavior) rather
-- than null now that "null = unfiltered" is meaningless with two
-- coexisting vectors per user.
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
    and tv.media_type = p_media_type
    and (1 - (te.embedding <=> tv.embedding)) >= p_min_similarity
    and t.type = p_media_type
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

-- Movie Night's per-participant exact-similarity pass (0023) -- same
-- taste_vectors.media_type gap, same fix. Movie Night already threads a
-- mediaType through its whole call chain (UserGroupParams.mediaType), so
-- the app-side call just needs to start passing it.
create or replace function public.title_similarity_for_user(
  p_user_id uuid,
  p_title_ids uuid[],
  p_media_type text default 'movie'
)
returns table (
  title_id uuid,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select te.title_id, 1 - (te.embedding <=> tv.embedding) as similarity
  from public.title_embeddings te
  cross join public.taste_vectors tv
  where tv.user_id = p_user_id
    and tv.media_type = p_media_type
    and te.title_id = any(p_title_ids);
$$;

-- Citation RPCs read straight from `ratings`, never through
-- taste_vectors, so they need their own titles join + type filter rather
-- than inheriting the fix above -- without this, a Movies-mode "Because
-- you loved X" citation could surface a TV show you loved, and vice
-- versa.
create or replace function public.most_similar_liked_title(
  p_user_id uuid,
  p_title_id uuid,
  p_min_similarity float default 0.78,
  p_media_type text default 'movie'
)
returns table (title_id uuid, similarity float)
language plpgsql
stable
as $$
declare
  v_target_embedding vector(1536);
begin
  select te0.embedding into v_target_embedding from public.title_embeddings te0 where te0.title_id = p_title_id;
  if v_target_embedding is null then
    return;
  end if;

  return query
  select r.title_id, 1 - (te.embedding <=> v_target_embedding) as similarity
  from public.ratings r
  join public.title_embeddings te on te.title_id = r.title_id
  join public.titles t on t.id = r.title_id
  where r.user_id = p_user_id
    and t.type = p_media_type
    and r.score >= 4.0
    and r.title_id <> p_title_id
    and 1 - (te.embedding <=> v_target_embedding) >= p_min_similarity
  order by te.embedding <=> v_target_embedding asc
  limit 1;
end;
$$;

create or replace function public.most_similar_liked_titles_batch(
  p_user_id uuid,
  p_title_ids uuid[],
  p_min_similarity float default 0.78,
  p_media_type text default 'movie'
)
returns table (title_id uuid, cited_title_id uuid, similarity float)
language sql
stable
as $$
  select c.title_id, l.title_id as cited_title_id, l.similarity
  from unnest(p_title_ids) as c(title_id)
  join public.title_embeddings te0 on te0.title_id = c.title_id
  cross join lateral (
    select r.title_id, 1 - (te.embedding <=> te0.embedding) as similarity
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    join public.titles t on t.id = r.title_id
    where r.user_id = p_user_id
      and t.type = p_media_type
      and r.score >= 4.0
      and r.title_id <> c.title_id
      and 1 - (te.embedding <=> te0.embedding) >= p_min_similarity
    order by te.embedding <=> te0.embedding asc
    limit 2
  ) as l;
$$;

-- Negative/implicit-positive signals (0052/0068/0053) also read straight
-- from ratings/dismissals/watchlist/watch_history, never taste_vectors --
-- same titles-join-plus-type-filter treatment, on every source in the
-- union so a movie dislike never dampens a TV candidate's score.
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
begin
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
  p_title_ids uuid[],
  p_media_type text default 'movie'
)
returns table (
  title_id uuid,
  max_similarity float
)
language plpgsql
stable
as $$
begin
  return query
  with implicit_positive as (
    select te.embedding
    from public.watchlist w
    join public.title_embeddings te on te.title_id = w.title_id
    join public.titles t on t.id = w.title_id
    where w.user_id = p_user_id and t.type = p_media_type
    union
    select te.embedding
    from public.watch_history wh
    join public.title_embeddings te on te.title_id = wh.title_id
    join public.titles t on t.id = wh.title_id
    where wh.user_id = p_user_id
      and t.type = p_media_type
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
  select c.title_id, coalesce(max(1 - (c.embedding <=> ip.embedding)), 0)::float as max_similarity
  from candidates c
  left join implicit_positive ip on true
  group by c.title_id;
end;
$$;

-- Cinema Score (0040) is the other per-profile stat "fully separate
-- profiles" covers -- rookie/intermediate/pro earned from watched+reviewed
-- counts. Without a type filter, a Shows-mode profile would show a tier
-- earned mostly from movie activity. Adds p_media_type (default 'movie'
-- so the existing no-arg call sites keep behaving exactly as before until
-- the app is updated to pass it explicitly).
create or replace function public.compute_cinema_score(p_user_id uuid, p_media_type text default 'movie')
returns table (watched_count int, reviewed_count int, points int)
language sql
stable
security invoker
set search_path = public
as $$
  with watched_titles as (
    select r.title_id from public.ratings r join public.titles t on t.id = r.title_id
    where r.user_id = p_user_id and t.type = p_media_type
    union
    select rv.title_id from public.reviews rv join public.titles t on t.id = rv.title_id
    where rv.user_id = p_user_id and t.type = p_media_type
  ),
  reviewed_titles as (
    select distinct rv.title_id from public.reviews rv join public.titles t on t.id = rv.title_id
    where rv.user_id = p_user_id and t.type = p_media_type
  )
  select
    (select count(*) from watched_titles)::int as watched_count,
    (select count(*) from reviewed_titles)::int as reviewed_count,
    (
      (select count(*) from watched_titles) * 50
      + (select count(*) from reviewed_titles) * 50
    )::int as points;
$$;

-- taste_attributes ("Entertainment DNA" -- pacing/violence/comedy
-- tolerance, favorite genres/decades/directors) is written by
-- computeTasteDna's best-effort upsert and read by matchmaking's
-- compatibility signal -- same one-row-per-user gap as taste_vectors had.
-- Without splitting this too, computing Shows DNA would silently
-- overwrite a user's movie favorite_genres/favorite_directors (whichever
-- media type was computed most recently always wins), and Movie Night /
-- profile compatibility would keep blending both types' attributes
-- together regardless of which toggle is active.
alter table public.taste_attributes add column if not exists media_type text;
update public.taste_attributes set media_type = 'movie' where media_type is null;
alter table public.taste_attributes alter column media_type set not null;
alter table public.taste_attributes add constraint taste_attributes_media_type_check check (media_type in ('movie', 'tv'));
alter table public.taste_attributes drop constraint taste_attributes_pkey;
alter table public.taste_attributes add primary key (user_id, media_type);

-- Backfill: rebuild every (user, media_type) vector that has ratings of
-- that type, now that both the loved-tier and fallback-tier math are
-- type-scoped. Cheap relative to the original per-user backfills (0059/
-- 0061/0062) since most of the catalogue -- and therefore most ratings --
-- is still movies; the 'tv' half only touches the ~500 TV raters that
-- exist post-Phase-2 ingestion.
do $$
declare
  v_user_id uuid;
  v_media_type text;
begin
  for v_user_id, v_media_type in
    select distinct r.user_id, t.type
    from public.ratings r
    join public.titles t on t.id = r.title_id
  loop
    perform public.recompute_taste_vector_for_user_for_type(v_user_id, v_media_type);
  end loop;
end $$;
