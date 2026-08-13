-- Two fixes, bundled because the second one only matters once the first
-- exists:
--
-- 1. ratings.rated_at -- a real "when did this person actually watch/rate
--    this" timestamp, distinct from created_at (which only ever records
--    when the *row* was written). For organically-rated titles those are
--    the same moment, so this backfills existing rows from created_at
--    (correct for them) and defaults new ones to now() the same way.
--    The gap this closes is Letterboxd bulk imports: import.ts writes
--    every imported rating in one batch, so created_at was always
--    "whenever the import ran," never the real watch date -- silently
--    breaking anything that reads rating history chronologically for an
--    imported library (taste evolution's earlier-vs-recent split, and the
--    recency-weighted taste vector below). The app now threads the actual
--    date from Letterboxd's CSV export into rated_at on import; existing
--    imported ratings still show their import date until re-imported,
--    since the original per-title dates were never captured before now.
--
-- 2. Restores the exponential recency-decay term that migration 0049 added
--    to recompute_taste_vector_for_user -- migration 0059 (adding the
--    non-lover fallback tier) redefined this function from scratch and
--    silently dropped the decay term entirely (its own comment claimed
--    only the squared-weighting formula from 0032 was being carried
--    forward, never mentioning 0049's decay, which quietly regressed task
--    #351 "recency-weighted taste vector" back to a flat, no-decay
--    average). 0061 (lowering the loved threshold to 3.5) inherited that
--    same gap. This restores the half-life-2-years decay 0049 designed,
--    now keyed on rated_at instead of updated_at -- updated_at has the
--    same import-time blind spot rated_at exists to fix, and re-rating a
--    title should still count as a fresh signal, which rated_at also
--    captures (see the ratings-upsert path, which is a plain upsert with
--    no separate "was this an update" branch, so rated_at isn't touched
--    on a change of score today; left as a possible future refinement,
--    not needed to fix the two bugs this migration targets).

alter table public.ratings add column if not exists rated_at timestamptz;
update public.ratings set rated_at = created_at where rated_at is null;
alter table public.ratings alter column rated_at set not null;
alter table public.ratings alter column rated_at set default now();

create or replace function public.recompute_taste_vector_for_user(p_user_id uuid)
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
      (
        (r.score - 2.5)::double precision
        * power(0.5::double precision, extract(epoch from (now() - r.rated_at)) / (730.0 * 86400.0))
      ) as weight,
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

-- Recompute for every user with at least one rating -- both the rated_at
-- backfill and the restored decay term change existing vectors, not just
-- ones missing a row.
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
