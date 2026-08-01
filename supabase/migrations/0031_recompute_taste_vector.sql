-- User curation should be the dominant signal driving recommendations, and
-- two real bugs were working directly against that:
--
-- 1. upsert_taste_vector_from_rating (0003, fixed for pgvector syntax in
--    0015) folds each new rating into a running average that divides by
--    total sample_size. For a user with hundreds of ratings, one more
--    rating — however strongly felt — barely moves the average at all, and
--    the vector ends up being a blurry mean of EVERY rating ever made
--    (mediocre ones included) rather than being dominated by what the user
--    has actually loved.
--
-- 2. Bulk imports (src/lib/actions/import.ts, both the CSV and paste
--    paths) write directly to `ratings`/`watch_history` and never call
--    upsert_taste_vector_from_rating at all — so a Letterboxd import of
--    hundreds of films (the exact "curation" this product cares most
--    about) has been contributing *nothing* to the taste vector.
--
-- This replaces the incremental update with a full recompute, built only
-- from the user's own top-rated titles (score >= 4/5), weighted by how
-- strongly they rated it (weight = score - 2.5, so 5 stars counts ~1.7x as
-- much as a bare 4 stars) and normalized by *total weight* rather than
-- row count — so the vector always reflects a true weighted centroid of
-- what the user has explicitly loved, undiluted no matter how large their
-- rating history grows. Called once per write (a single rating, or once
-- at the end of a bulk import) rather than per row.
create or replace function public.recompute_taste_vector_for_user(p_user_id uuid)
returns void
language sql
as $$
  with contributing as (
    select
      (r.score - 2.5)::double precision as weight,
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

-- upsert_taste_vector_from_rating's callers (rateTitle, claimAnonymousSwipes)
-- now just delegate to a full recompute — same effect, no more silent
-- dilution, and it also means unrateTitle can call this too (see
-- src/lib/actions/social.ts) to correctly *remove* a rating's influence,
-- which the old incremental-only function had no way to do at all.
create or replace function public.upsert_taste_vector_from_rating(
  p_user_id uuid,
  p_title_id uuid,
  p_score numeric
)
returns void
language plpgsql
as $$
begin
  perform public.recompute_taste_vector_for_user(p_user_id);
end;
$$;
