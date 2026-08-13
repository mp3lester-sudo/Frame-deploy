-- Home page perf: most_similar_liked_title (0016/0032) takes one title id
-- at a time. getRecommendationsForUser calls it once per citation target
-- via Promise.all -- genuinely parallel, but each one is still its own
-- HTTP round trip to PostgREST (connection checkout, auth verification,
-- TLS), separate from the actual query cost. For a typical home page
-- request that's up to `limit` (9) extra round trips stacked on top of
-- everything else the page already does, all just to answer "what did
-- this user love that's similar to each of these titles."
--
-- most_similar_liked_titles_batch answers the same question for every
-- candidate title at once, in a single round trip -- a lateral join per
-- candidate does the same per-candidate vector search work the old
-- per-call version did, just without paying HTTP overhead N times over.
create or replace function public.most_similar_liked_titles_batch(
  p_user_id uuid,
  p_title_ids uuid[],
  p_min_similarity float default 0.78
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
    where r.user_id = p_user_id
      and r.score >= 4.0
      and r.title_id <> c.title_id
      and 1 - (te.embedding <=> te0.embedding) >= p_min_similarity
    order by te.embedding <=> te0.embedding asc
    limit 2
  ) as l;
$$;
