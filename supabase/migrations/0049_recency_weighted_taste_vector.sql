-- Recency-weighted taste vector.
--
-- recompute_taste_vector_for_user (0031) builds the taste vector as a
-- weighted centroid of every score>=4 rating a user has EVER made, with the
-- only weighting being how strongly they rated it (score - 2.5). A rating
-- from three years ago pulls exactly as hard as one from last week, even
-- though people's taste genuinely drifts -- someone who loved teen comedies
-- in 2019 and has rated almost exclusively slow-burn dramas since should
-- have their vector reflect who they are now, not an unweighted average of
-- their whole rating history.
--
-- This adds an exponential recency decay on top of the existing score-based
-- weight, keyed off ratings.updated_at (not created_at) -- re-rating a title
-- is a fresh, current taste signal even if the row itself is old, and
-- updated_at already tracks that correctly.
--
-- Half-life is deliberately generous (2 years, not weeks/months): movie
-- taste is far more stable than, say, music listening habits, and this is
-- meant to gently favor recent curation, not erase everything older than a
-- few months. At exactly one half-life old, a rating counts for half its
-- original weight; at two half-lives (4 years), a quarter; it never hits
-- exactly zero, so a long-standing favorite genre never gets fully wiped
-- out just because someone hasn't re-rated anything in that genre lately.
create or replace function public.recompute_taste_vector_for_user(p_user_id uuid)
returns void
language sql
as $$
  with contributing as (
    select
      (r.score - 2.5)::double precision
        * power(
            0.5::double precision,
            extract(epoch from (now() - r.updated_at)) / (730.0 * 86400.0)
          ) as weight,
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

-- Taste vectors only change day-to-day when a rating is added/changed/
-- removed, not from time passing on its own -- so recency decay above only
-- takes effect on the next write for a given user. A one-time recompute for
-- everyone with an existing vector applies the new decay retroactively
-- rather than waiting for each user's next rating to pick it up.
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in select user_id from public.taste_vectors loop
    perform public.recompute_taste_vector_for_user(v_user_id);
  end loop;
end $$;
