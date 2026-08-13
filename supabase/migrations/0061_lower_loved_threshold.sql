-- Lower the "loved" threshold that feeds the primary taste-vector tier
-- from 4.0 to 3.5 (product decision, following up on 0059's fallback
-- fix for users who never hit 4.0 at all). At 4.0, someone whose scores
-- genuinely cluster in the 3.5-3.99 range still had those ratings
-- excluded from the primary "loved" centroid -- 0059's fallback tier
-- covered the *zero-qualifying-ratings* case, but anyone who cleared
-- 4.0 even once was locked into the primary tier while their 3.5-3.99
-- ratings (real positive signal) sat unused. Pushing the cutoff to 3.5
-- pulls that signal in for everyone, not just people who never hit 4.0.
--
-- Only the WHERE clause on the `loved` CTE changes (4.0 -> 3.5). The
-- squared-weighting formula (migration 0032), the fallback tier and its
-- own (score - 2.5) signed-midpoint logic (migration 0059), and the
-- insert/backfill shape are all unchanged.
create or replace function public.recompute_taste_vector_for_user(p_user_id uuid)
returns void
language sql
as $$
  with loved as (
    select
      power((r.score - 2.5)::double precision, 2) as weight,
      (te.embedding::real[])::double precision[] as arr
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    where r.user_id = p_user_id
      and r.score >= 3.5
  ),
  has_loved as (
    select count(*) > 0 as any_loved from loved
  ),
  -- Fallback tier -- only ever read from when `loved` is completely
  -- empty (i.e. every single rating this user has made is below 3.5).
  everything as (
    select
      (r.score - 2.5)::double precision as weight,
      (te.embedding::real[])::double precision[] as arr
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    where r.user_id = p_user_id
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
  insert into public.taste_vectors (user_id, embedding, sample_size)
  select p_user_id, (select vec from final_vec)::vector, (select n from total)
  where (select vec from final_vec) is not null
  on conflict (user_id) do update
  set embedding = excluded.embedding, sample_size = excluded.sample_size, updated_at = now();
$$;

-- Recompute for EVERY user with at least one rating, not just users
-- missing a taste_vectors row -- unlike 0059's backfill, this threshold
-- change also affects people who already have a vector (anyone with a
-- 3.5-3.99 rating that was previously excluded from the "loved" tier
-- gets a different vector now that it's included).
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct user_id from public.ratings
  loop
    perform public.recompute_taste_vector_for_user(v_user_id);
  end loop;
end $$;
