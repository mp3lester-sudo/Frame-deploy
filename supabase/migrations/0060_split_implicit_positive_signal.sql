-- Recommendation accuracy: split the implicit-positive signal.
--
-- similarity_to_implicit_positive_titles (migration 0053) UNIONed
-- watchlist adds and watched-but-unrated titles into one undifferentiated
-- pool before computing max_similarity, then implicit-affinity.ts applied
-- a single boost regardless of which source drove the match. That
-- conflates two behaviors of very different strength: a watchlist add is
-- deliberate, forward-looking curation ("I looked at this and decided I
-- want to watch it") -- close in spirit to an explicit positive signal.
-- Watching something and never rating it is genuinely ambiguous: it could
-- mean love-and-forgot, mild indifference, or a half-watched title someone
-- bailed on. Treating both as identical evidence let the weaker, noisier
-- signal move scores exactly as much as the stronger one.
--
-- This returns two similarity columns instead of one, so the caller can
-- weight them differently (see implicit-affinity.ts). Same embedding-join
-- shape as before, just no longer UNIONed before the max() aggregation.
create or replace function public.similarity_to_implicit_positive_titles(
  p_user_id uuid,
  p_title_ids uuid[]
)
returns table (
  title_id uuid,
  max_similarity_watchlist float,
  max_similarity_watched_unrated float
)
language plpgsql
stable
as $$
begin
  return query
  with watchlist_positive as (
    select te.embedding
    from public.watchlist w
    join public.title_embeddings te on te.title_id = w.title_id
    where w.user_id = p_user_id
  ),
  watched_unrated_positive as (
    select te.embedding
    from public.watch_history wh
    join public.title_embeddings te on te.title_id = wh.title_id
    where wh.user_id = p_user_id
      and not exists (
        select 1 from public.ratings r
        where r.user_id = wh.user_id and r.title_id = wh.title_id
      )
  ),
  candidates as (
    select te.title_id, te.embedding
    from public.title_embeddings te
    where te.title_id = any(p_title_ids)
  )
  select
    c.title_id,
    coalesce(max(1 - (c.embedding <=> wp.embedding)), 0)::float as max_similarity_watchlist,
    coalesce(max(1 - (c.embedding <=> wu.embedding)), 0)::float as max_similarity_watched_unrated
  from candidates c
  left join watchlist_positive wp on true
  left join watched_unrated_positive wu on true
  group by c.title_id;
end;
$$;
