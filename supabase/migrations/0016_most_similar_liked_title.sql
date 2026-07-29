-- Powers "why this pick" citations ("Because you loved X") on the home
-- page: given a recommended title, finds the single title from the user's
-- own highly-rated history whose embedding is closest to it, if any are
-- close enough to be a meaningful citation. Kept in Postgres (like
-- match_titles_for_user / similar_users_liked) rather than pulling full
-- 1536-dim embeddings over the wire into the app just to compute a cosine
-- similarity in JS.
create or replace function public.most_similar_liked_title(
  p_user_id uuid,
  p_title_id uuid,
  p_min_similarity float default 0.78
)
returns table (title_id uuid, similarity float)
language plpgsql
stable
as $$
declare
  v_target_embedding vector(1536);
begin
  -- Qualified with the table alias: `returns table (title_id uuid, ...)`
  -- implicitly declares title_id as a plpgsql variable in scope for the
  -- whole function body, which collides with an unqualified reference to
  -- the title_embeddings.title_id column ("ambiguous: could refer to
  -- either a PL/pgSQL variable or a table column").
  select te0.embedding into v_target_embedding from public.title_embeddings te0 where te0.title_id = p_title_id;
  if v_target_embedding is null then
    return;
  end if;

  return query
  select r.title_id, 1 - (te.embedding <=> v_target_embedding) as similarity
  from public.ratings r
  join public.title_embeddings te on te.title_id = r.title_id
  where r.user_id = p_user_id
    and r.score >= 4.0
    and r.title_id <> p_title_id
    and 1 - (te.embedding <=> v_target_embedding) >= p_min_similarity
  order by te.embedding <=> v_target_embedding asc
  limit 1;
end;
$$;
