-- Root-cause fix for match_titles_for_user timing out for EVERY user,
-- confirmed directly against production: even a 2-rating test account's
-- call to this RPC hit Supabase's statement timeout. This is the single
-- shared candidate-generation RPC behind the home hero + MoodRow
-- (engine.ts), Taste DNA's signature pick (signature-pick.ts), the
-- re-engagement email campaign (reengagement/campaign.ts), Movie Night's
-- per-participant seed (movie-night.ts), and the Hidden Gem card
-- (hidden-gem.ts) -- so this one query timing out silently degraded
-- personalization on every one of those surfaces to their popularity
-- fallback, not just the group-blend feature that surfaced it.
--
-- The actual bug: `cross join public.taste_vectors tv ... order by
-- te.embedding <=> tv.embedding limit p_match_count` orders by the
-- distance to a COLUMN from a joined table, not a literal/bound
-- parameter. pgvector's ivfflat/hnsw index can only accelerate
-- `ORDER BY column <=> $param LIMIT n` when the right-hand side is a
-- parameter or literal the planner can bind once -- a join-derived
-- column defeats that, so despite title_embeddings having had an ivfflat
-- index since migration 0001 (and probes tuned in migration 0026), this
-- query has likely never actually used it. It was fast enough with a
-- smaller catalogue to hide this; at ~36k titles / ~20k embedded rows it
-- now means a full sequential scan + cosine-distance computation across
-- every embedded title, for every call, which is exactly what blows past
-- the statement timeout.
--
-- The fix: fetch the caller's taste vector into a plpgsql variable via a
-- fast primary-key lookup on taste_vectors(user_id, media_type) FIRST,
-- then order by distance to that local variable. `column <=> variable`
-- is the pattern pgvector's ANN index actually accelerates, so this
-- restores the sub-second lookup migration 0026 assumed was already
-- happening. Every other clause (min-similarity floor, exclude watched/
-- favorited/reviewed, media-type scoping) is unchanged from migration
-- 0076 -- only the join-vs-variable shape of the vector itself changes.
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
begin
  perform set_config('ivfflat.probes', '10', true);

  select embedding into v_taste_vector
  from public.taste_vectors
  where user_id = p_user_id and media_type = p_media_type;

  if v_taste_vector is null then
    return;
  end if;

  return query
  select
    te.title_id,
    1 - (te.embedding <=> v_taste_vector) as similarity
  from public.title_embeddings te
  join public.titles t on t.id = te.title_id
  where t.type = p_media_type
    and (1 - (te.embedding <=> v_taste_vector)) >= p_min_similarity
    and (
      not p_exclude_watched
      or not exists (
        select 1 from public.watch_history wh
        where wh.user_id = p_user_id and wh.title_id = te.title_id
      )
    )
    and not exists (
      select 1 from public.favorite_titles ft
      where ft.user_id = p_user_id and ft.title_id = te.title_id
    )
    and not exists (
      select 1 from public.reviews r
      where r.user_id = p_user_id and r.title_id = te.title_id
    )
  order by te.embedding <=> v_taste_vector asc
  limit p_match_count;
end;
$$;
