-- Fix upsert_taste_vector_from_rating: the original (migration 0003) used
-- `vector * double precision` (scalar multiplication), which this project's
-- installed pgvector version doesn't support — every call has been failing
-- with "operator does not exist: vector * double precision" since the
-- function was created. That means no taste_vectors row has ever been built
-- successfully, for any user, ever (confirmed: 13/13 historical ratings
-- failed to replay when this was discovered).
--
-- Rewritten to do the same weighted-average math via double precision[]
-- arrays (cast vector <-> array, which pgvector has supported since its
-- earliest versions) instead of relying on scalar multiplication. Same
-- formula, same semantics — only the arithmetic mechanism changes.
create or replace function public.upsert_taste_vector_from_rating(
  p_user_id uuid,
  p_title_id uuid,
  p_score numeric
)
returns void
language plpgsql
as $$
declare
  v_title_embedding vector(1536);
  v_weight double precision;
  v_insert_weight double precision;
  v_existing record;
  v_title_arr double precision[];
  v_existing_arr double precision[];
  v_new_arr double precision[];
  v_new_sample_size int;
begin
  select embedding into v_title_embedding from public.title_embeddings where title_id = p_title_id;
  if v_title_embedding is null then
    return; -- title not embedded yet; ingestion pipeline will backfill
  end if;

  -- Ratings below 2.5 pull the vector away (negative weight); above push toward it.
  v_weight := (p_score - 2.5) / 2.5;
  -- Only clamp on a brand-new vector, so the very first sample can't produce
  -- a degenerate zero/negative-length starting vector. Subsequent updates
  -- keep using the raw (possibly negative) weight so low ratings genuinely
  -- pull the running average away — same as the original function.
  v_insert_weight := greatest(v_weight, 0.05);

  -- pgvector only defines a vector -> real[] cast (not vector -> double
  -- precision[]) — the reverse, casting an array INTO vector, does accept
  -- double precision[], which is why the extraction below goes through
  -- real[] first but the final ::vector casts at the bottom don't need to.
  v_title_arr := (v_title_embedding::real[])::double precision[];

  select * into v_existing from public.taste_vectors where user_id = p_user_id;

  if v_existing is null then
    select array_agg(x * v_insert_weight order by ord)
    into v_new_arr
    from unnest(v_title_arr) with ordinality as t(x, ord);

    insert into public.taste_vectors (user_id, embedding, sample_size)
    values (p_user_id, v_new_arr::vector, 1);
  else
    v_existing_arr := (v_existing.embedding::real[])::double precision[];
    v_new_sample_size := v_existing.sample_size + 1;

    select array_agg(
      ((v_existing_arr[ord] * v_existing.sample_size) + (v_title_arr[ord] * v_weight)) / v_new_sample_size
      order by ord
    )
    into v_new_arr
    from generate_subscripts(v_existing_arr, 1) as ord;

    update public.taste_vectors
    set
      embedding = v_new_arr::vector,
      sample_size = v_new_sample_size,
      updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;
