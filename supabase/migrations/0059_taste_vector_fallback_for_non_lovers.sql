-- Root cause of "I've rated ~500 films but the app treats me as brand new":
-- recompute_taste_vector_for_user (0031 -> 0032 -> 0049) has ONLY ever
-- built the taste vector from ratings scored >= 4.0 ("loved"). And since
-- migration 0031, upsert_taste_vector_from_rating (called on literally
-- every single rating a user submits, see rateTitle in
-- src/lib/actions/social.ts) just delegates straight to this same
-- function. There is currently no code path anywhere that creates a
-- taste_vectors row for a user unless at least one of their ratings is
-- >= 4.0 AND that title has an embedding.
--
-- That's fine for the common case (most active raters give SOMETHING a 4
-- or 5 eventually), but it's a hard cliff for a demanding/discerning
-- rater whose scores genuinely cluster below 4.0 -- rate 500 films at a
-- consistent "good, not amazing" 3-3.5 and the INSERT's own
-- `where (select vec from final_vec) is not null` clause matches zero
-- rows, every single time, forever. No taste_vectors row is ever
-- created. getRecommendationsForUser (engine.ts) checks for that row's
-- existence to decide cold-start vs personalized -- so a genuinely
-- heavy, engaged user gets treated identically to someone who signed up
-- five minutes ago and hasn't rated anything, which is exactly the "you
-- haven't rated enough yet" copy the screenshot showed.
--
-- Fix: add a fallback tier. The >=4.0 "loved" centroid (unchanged,
-- squared-weighted per migration 0032) stays the PRIMARY signal and is
-- used exactly as before whenever a user has at least one qualifying
-- rating -- no behavior change for the common case. Only when that tier
-- is completely empty does it fall back to using every one of the
-- user's ratings, signed (below 2.5 pulls away, above pulls toward) the
-- same polarity the very first (pre-0031) version used -- normalized by
-- total |weight| rather than raw sum, since a signed sum can be near
-- zero or negative and would otherwise blow up or flip the vector's
-- scale unpredictably.
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
      and r.score >= 4.0
  ),
  has_loved as (
    select count(*) > 0 as any_loved from loved
  ),
  -- Fallback tier -- only ever read from when `loved` is completely
  -- empty. Every rating the user has made, signed by (score - 2.5), so a
  -- discerning rater who never quite hits 4.0 still gets a real,
  -- personalized vector reflecting what they rated relatively higher vs
  -- lower, instead of nothing at all.
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

-- Retroactive fix: every existing user who has ratings but got silently
-- skipped by the old >=4.0-only version (exactly the bug this migration
-- fixes) needs their vector built NOW, not on their next rating change --
-- same backfill pattern as migrations 0032/0049.
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct user_id from public.ratings
    where user_id not in (select user_id from public.taste_vectors)
  loop
    perform public.recompute_taste_vector_for_user(v_user_id);
  end loop;
end $$;
