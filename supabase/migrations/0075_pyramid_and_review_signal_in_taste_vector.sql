-- "Pull from absolutely everything" -- two real gaps in what actually
-- shapes a user's taste vector, found by tracing every write path that
-- touches recompute_taste_vector_for_user / upsert_taste_vector_from_rating
-- (see engine.ts's doc comment: content similarity against this vector is
-- the ONLY scoring input now, so anything not folded in here is
-- invisible to every recommendation, not just a minor omission):
--
--  1. Personal Pyramid (favorite_titles) -- a deliberately ranked top-6,
--     rendered on the profile page since migration 0010/0025, never once
--     read by recompute_taste_vector_for_user_for_type. A user's most
--     considered, explicit taste statement was contributing literally
--     nothing.
--  2. Reviews -- writeReview (social.ts) has zero dependency on ratings;
--     someone can write a full review of a title they never star-rated,
--     and today that review is pure display copy. inferred_score (added
--     below) is a one-time AI estimate of the review's sentiment as a
--     0.5-5.0 equivalent score, computed at write time (see writeReview),
--     used here exactly like a rating.
--
-- Both new sources are gated the same way: only contribute for a title
-- the user hasn't ALSO star-rated. If they rated it too, that rating's
-- own weight already captures the preference -- adding a second
-- contribution would just inflate an already-counted title rather than
-- closing the real gap (a title with taste signal from *only* a Pyramid
-- slot or *only* a review, and no rating at all).

alter table public.reviews add column if not exists inferred_score numeric(2,1);
alter table public.reviews add constraint reviews_inferred_score_check
  check (inferred_score is null or (inferred_score >= 0.5 and inferred_score <= 5.0));

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
  -- Personal Pyramid favorites: only for a title with no explicit rating
  -- (see doc comment above). Position tapers a synthetic score from 5.0
  -- (#1) down to 4.0 (#6) -- every slot still reads as a clear favorite,
  -- first place simply counts a bit more. No recency decay: a Pyramid
  -- slot is a standing declaration the user can change any time, not a
  -- timestamped reaction like a rating or a review.
  favorited as (
    select
      (5.0 - (ft.position - 1) * 0.2)::double precision as synth_score,
      (te.embedding::real[])::double precision[] as arr
    from public.favorite_titles ft
    join public.title_embeddings te on te.title_id = ft.title_id
    join public.titles t on t.id = ft.title_id
    where ft.user_id = p_user_id
      and ft.media_type = p_media_type
      and not exists (
        select 1 from public.ratings r where r.user_id = p_user_id and r.title_id = ft.title_id
      )
  ),
  -- Reviews with an AI-inferred sentiment score and no explicit rating
  -- (see doc comment above). Does get the same recency decay as a real
  -- rating, unlike favorited above -- a review is a timestamped reaction.
  reviewed as (
    select
      rv.inferred_score::double precision as synth_score,
      rv.created_at as ts,
      (te.embedding::real[])::double precision[] as arr
    from public.reviews rv
    join public.title_embeddings te on te.title_id = rv.title_id
    join public.titles t on t.id = rv.title_id
    where rv.user_id = p_user_id
      and t.type = p_media_type
      and rv.inferred_score is not null
      and not exists (
        select 1 from public.ratings r where r.user_id = p_user_id and r.title_id = rv.title_id
      )
  ),
  contributing as (
    select weight, arr, abs(weight) as norm_weight from loved
    where (select any_loved from has_loved)
    union all
    select weight, arr, abs(weight) as norm_weight from everything
    where not (select any_loved from has_loved)
    union all
    -- favorited/reviewed always contribute in both modes (loved-only vs.
    -- everything-fallback) -- they're supplementary positive signal, not
    -- part of the has_loved bifurcation that exists specifically to
    -- decide how to treat NEGATIVE ratings. Weight style (squared vs.
    -- signed) still matches whichever mode is active so magnitudes stay
    -- on the same scale as the rest of `contributing`.
    select
      (case when (select any_loved from has_loved)
        then power((synth_score - 2.5)::double precision, 2)
        else (synth_score - 2.5)::double precision
      end) as weight,
      arr,
      abs(case when (select any_loved from has_loved)
        then power((synth_score - 2.5)::double precision, 2)
        else (synth_score - 2.5)::double precision
      end) as norm_weight
    from favorited
    union all
    select
      (case when (select any_loved from has_loved)
        then power((synth_score - 2.5)::double precision, 2) * power(0.5::double precision, extract(epoch from (now() - ts)) / (730.0 * 86400.0))
        else (synth_score - 2.5)::double precision * power(0.5::double precision, extract(epoch from (now() - ts)) / (730.0 * 86400.0))
      end) as weight,
      arr,
      abs(case when (select any_loved from has_loved)
        then power((synth_score - 2.5)::double precision, 2) * power(0.5::double precision, extract(epoch from (now() - ts)) / (730.0 * 86400.0))
        else (synth_score - 2.5)::double precision * power(0.5::double precision, extract(epoch from (now() - ts)) / (730.0 * 86400.0))
      end) as norm_weight
    from reviewed
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

-- Backfill: every user with existing Pyramid favorites gets their vector
-- recomputed now, so this doesn't sit dormant until their next rating.
-- Reviews aren't backfilled here -- inferred_score requires an actual AI
-- call per review body, which a SQL migration can't do; existing reviews
-- stay at inferred_score = null (no contribution) until a separate
-- backfill script runs, same pattern as the TV metadata backfill
-- (migration 0073/backfill-tv-metadata.js). New reviews get scored going
-- forward regardless (see writeReview, social.ts).
do $$
declare
  v_user_id uuid;
  v_media_type text;
begin
  for v_user_id, v_media_type in
    select distinct user_id, media_type from public.favorite_titles
  loop
    perform public.recompute_taste_vector_for_user_for_type(v_user_id, v_media_type);
  end loop;
end $$;
