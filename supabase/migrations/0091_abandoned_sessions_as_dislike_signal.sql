-- "Started it, gave up on it" as a third dislike-adjacent signal --
-- similarity_to_disliked_titles (0052, folded into 0068's dismissal
-- union, re-scoped by media_type in 0071) already treats "a rating <=
-- 2.5" and "a Discover swipe-left" as the same negative-similarity
-- source. An abandoned Press Play session (migration 0089) is a third:
-- weaker than either -- nobody left a rating, nobody made an explicit
-- "don't show me this again" gesture -- but a real behavioral signal a
-- swipe-dismiss never had, since it means the title was actually
-- playing, not just glanced at in a deck.
--
-- Two guardrails keep this from being noisier than it's worth:
--
--  1. Minimum progress. Someone who presses Play and abandons 90 seconds
--     in almost certainly hit a wrong-mood moment or a mis-tap, not a
--     taste judgment -- that's not a signal, it's noise. Someone who gets
--     65% through and still bails is a real "I gave this a real chance
--     and didn't want to finish it." ABANDON_PROGRESS_FLOOR (0.25) is the
--     line: below it, contributes nothing; a session with no
--     runtime_minutes on record (title's runtime was unknown at watch
--     time) can't be evaluated against a fraction at all, so it's
--     excluded outright rather than guessed at.
--
--  2. Lowest precedence of any signal touching this title. If the user
--     rated it, favorited it into their Pyramid, or wrote a review that
--     got an inferred_score, one of those already carries their real
--     opinion -- an abandon before or after any of those shouldn't also
--     vote. Mirrors the "only contribute for a title with no rating"
--     gate migration 0075 uses for Pyramid/review contributions to the
--     taste vector, applied here to keep this out of the vector
--     entirely: same design call as 0066's title_dismissals comment --
--     an implicit, unrated signal earns a soft downstream penalty, never
--     a synthetic score folded into the vector math itself.
create or replace function public.similarity_to_disliked_titles(
  p_user_id uuid,
  p_title_ids uuid[],
  p_dislike_max_score numeric default 2.5,
  p_media_type text default 'movie'
)
returns table (
  title_id uuid,
  max_similarity float
)
language plpgsql
stable
as $$
declare
  abandon_progress_floor constant double precision := 0.25;
begin
  return query
  with disliked as (
    select te.embedding
    from public.ratings r
    join public.title_embeddings te on te.title_id = r.title_id
    join public.titles t on t.id = r.title_id
    where r.user_id = p_user_id and r.score <= p_dislike_max_score and t.type = p_media_type
    union
    select te.embedding
    from public.title_dismissals d
    join public.title_embeddings te on te.title_id = d.title_id
    join public.titles t on t.id = d.title_id
    where d.user_id = p_user_id and t.type = p_media_type
    union
    select te.embedding
    from public.watch_sessions ws
    join public.title_embeddings te on te.title_id = ws.title_id
    join public.titles t on t.id = ws.title_id
    where ws.user_id = p_user_id
      and t.type = p_media_type
      and ws.status = 'abandoned'
      and ws.runtime_minutes is not null
      and ws.runtime_minutes > 0
      and ws.accumulated_seconds >= abandon_progress_floor * ws.runtime_minutes * 60
      and not exists (select 1 from public.ratings r2 where r2.user_id = p_user_id and r2.title_id = ws.title_id)
      and not exists (select 1 from public.favorite_titles ft where ft.user_id = p_user_id and ft.title_id = ws.title_id)
      and not exists (
        select 1 from public.reviews rv
        where rv.user_id = p_user_id and rv.title_id = ws.title_id and rv.inferred_score is not null
      )
  ),
  candidates as (
    select te.title_id, te.embedding
    from public.title_embeddings te
    where te.title_id = any(p_title_ids)
  )
  select c.title_id, coalesce(max(1 - (c.embedding <=> d.embedding)), 0)::float as max_similarity
  from candidates c
  left join disliked d on true
  group by c.title_id;
end;
$$;
