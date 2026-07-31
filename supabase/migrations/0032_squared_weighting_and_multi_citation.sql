-- Phase 2 of "user curation is the key": two further refinements on top of
-- migration 0031's full-recompute taste vector and the citation-threshold
-- fixes already shipped.
--
-- 1. Sharper distinction between a 5-star and a 4-star rating. The weight
--    formula in recompute_taste_vector_for_user was linear (score - 2.5),
--    so a 5-star rating (weight 2.5) only counted ~1.7x as much as a bare
--    4-star (weight 1.5). Squaring the weight (still only ever applied to
--    ratings >= 4, so it's always a positive quantity -- no sign issues)
--    widens that gap to ~2.8x, so the vector leans harder toward what a
--    user has *truly* loved rather than merely liked.
--
-- 2. most_similar_liked_title used to return only the single closest match
--    from a user's rating history. A pick can genuinely sit between two
--    different films someone loves -- returning up to 2 lets the headline
--    say "Because you loved X and Y" instead of arbitrarily naming just
--    one. (App-side change in engine.ts/explain.ts handles up to 2 already
--    -- this just needs the RPC to actually return a second row.)

create or replace function public.recompute_taste_vector_for_user(p_user_id uuid)
returns void
language sql
as $$
  with contributing as (
    select
      power((r.score - 2.5)::double precision, 2) as weight,
      (te.embedding::real[])::double precision[] as arr
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    where r.user_id = p_user_id
      and r.score >= 4.0
  ),
  total as (
    select sum(weight) as total_weight, count(*) as n from contributing
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
  insert into public.taste_vectors (user_id, embedding, sample_size)
  select p_user_id, (select vec from final_vec)::vector, (select n from total)
  where (select vec from final_vec) is not null
  on conflict (user_id) do update
  set embedding = excluded.embedding, sample_size = excluded.sample_size, updated_at = now();
$$;

create or replace function public.most_similar_liked_title(
  p_user_id uuid,
  p_title_id uuid,
  p_min_similarity float default 0.78
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
  where r.user_id = p_user_id
    and r.score >= 4.0
    and r.title_id <> p_title_id
    and 1 - (te.embedding <=> v_target_embedding) >= p_min_similarity
  order by te.embedding <=> v_target_embedding asc
  limit 2;
end;
$$;

-- Backfill every existing user's taste vector under the new squared
-- weighting -- without this, only new ratings/imports after today would
-- benefit from the sharper 5-vs-4-star distinction.
select public.recompute_taste_vector_for_user(id) from public.profiles;
