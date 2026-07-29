-- match_titles_for_user has no security clause (defaults to SECURITY
-- INVOKER), so when it's called for a user OTHER than whoever is actually
-- signed in — exactly what Movie Night's group blending does, looping over
-- every participant (src/lib/recommendations/movie-night.ts) — its internal
-- reads of that OTHER user's taste_vectors (and watch_history, for the
-- exclude-watched check) are subject to THAT CALLER's RLS, not the target
-- user's. taste_vectors' "own taste vector" policy (migration 0002) means
-- the query silently returns nothing for anyone but the caller themself.
--
-- This is the exact same bug class fixed in migration 0022 for
-- similar_users_liked, just hitting a second function: any Movie Night with
-- more than one participant has effectively only ever used whichever
-- participant happened to be the one with an open session calling this —
-- everyone else's taste silently contributed nothing to the group pick.
--
-- security definer (+ search_path pinned, the standard companion setting)
-- fixes it the same way: runs with the function owner's privileges
-- regardless of caller, still only ever returns (title_id, similarity) —
-- never another user's raw ratings, watch history, or embedding.
create or replace function public.match_titles_for_user(
  p_user_id uuid,
  p_match_count int default 20,
  p_exclude_watched boolean default true
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
  return query
  select
    te.title_id,
    1 - (te.embedding <=> tv.embedding) as similarity
  from public.title_embeddings te
  cross join public.taste_vectors tv
  where tv.user_id = p_user_id
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

-- New: exact per-user similarity for a SPECIFIC set of titles, rather than
-- "your top N" — Movie Night's group-fairness pass (see
-- src/lib/recommendations/movie-night.ts) needs every participant's real
-- similarity score for the SAME candidate pool to normalize and apply a
-- "nobody gets a title they'd hate" floor. Relying on match_titles_for_user
-- alone can't do this: a title absent from someone's top-N list is
-- ambiguous (bad match, or just outside an arbitrary cutoff?), which is
-- exactly the ambiguity a hard fairness floor can't tolerate.
create or replace function public.title_similarity_for_user(
  p_user_id uuid,
  p_title_ids uuid[]
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
    and te.title_id = any(p_title_ids);
$$;
