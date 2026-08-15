-- Hard-exclude Pyramid favorites and reviewed titles from every
-- recommendation surface. match_titles_for_user (0003 -> 0023 -> 0026 ->
-- 0058 -> 0069 -> 0071) is the single shared candidate-generation RPC
-- behind the home hero + MoodRow (engine.ts), Taste DNA's signature pick
-- (signature-pick.ts), the re-engagement email campaign
-- (reengagement/campaign.ts), Movie Night's per-participant seed
-- (movie-night.ts), and the Hidden Gem card (hidden-gem.ts) -- fixing the
-- exclusion here once, inside the function, guarantees it everywhere
-- those callers read from, rather than needing every TypeScript call site
-- to separately remember to filter it out (which is exactly how this gap
-- existed in the first place: p_exclude_watched only ever checked
-- watch_history, never favorite_titles or reviews).
--
-- Two gaps this closes:
--   1. Personal Pyramid picks (favorite_titles) never required a
--      corresponding star rating or watch_history row -- a title added
--      to someone's Pyramid straight from the picker, without ever being
--      separately rated, could still surface as a "fresh" recommendation.
--   2. A written review (reviews) never wrote a watch_history row either
--      (writeReview in social.ts only inserts into reviews +
--      activity_events) -- so a reviewed-but-never-separately-rated title
--      had the same gap.
-- Both are always wrong to recommend again regardless of p_exclude_watched
-- (there's no legitimate "show me a Pyramid pick as a new suggestion"
-- case), so both exclusions are unconditional, not new opt-out params.

create or replace function public.match_titles_for_user(
  p_user_id uuid,
  p_match_count int default 20,
  p_exclude_watched boolean default true,
  p_min_similarity float default 0.2,
  p_media_type text default 'movie'
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
  perform set_config('ivfflat.probes', '10', true);

  return query
  select
    te.title_id,
    1 - (te.embedding <=> tv.embedding) as similarity
  from public.title_embeddings te
  cross join public.taste_vectors tv
  join public.titles t on t.id = te.title_id
  where tv.user_id = p_user_id
    and tv.media_type = p_media_type
    and (1 - (te.embedding <=> tv.embedding)) >= p_min_similarity
    and t.type = p_media_type
    and (
      not p_exclude_watched
      or not exists (
        select 1 from public.watch_history wh
        where wh.user_id = p_user_id and wh.title_id = te.title_id
      )
    )
    and not exists (
      select 1 from public.favorite_titles ft
      where ft.user_id = p_user_id and ft.title_id = te.title_id
    )
    and not exists (
      select 1 from public.reviews r
      where r.user_id = p_user_id and r.title_id = te.title_id
    )
  order by te.embedding <=> tv.embedding asc
  limit p_match_count;
end;
$$;
