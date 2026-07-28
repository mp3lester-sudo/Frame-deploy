-- Taste — Phase 7: semantic title search by an arbitrary embedding
-- (used by the AI concierge to turn a free-text request like
-- "something that feels lonely" into candidate titles before the LLM
-- ever sees them, so it can only explain — never hallucinate — the catalogue).

create or replace function public.match_titles_by_query(
  p_embedding vector(1536),
  p_match_count int default 12
)
returns table (
  title_id uuid,
  similarity float
)
language sql
stable
as $$
  select
    te.title_id,
    1 - (te.embedding <=> p_embedding) as similarity
  from public.title_embeddings te
  order by te.embedding <=> p_embedding asc
  limit p_match_count;
$$;
