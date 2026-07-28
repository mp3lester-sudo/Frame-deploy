-- Basic rate limiting for cost-incurring API routes (AI concierge, ending
-- explainer). Implemented in Postgres rather than in-memory because Vercel's
-- serverless functions don't reliably share memory across invocations — an
-- in-process Map would only limit a single warm instance, not the endpoint
-- as a whole.
create table public.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limit_buckets enable row level security;
-- No policies granted to anon/authenticated — only the service-role client
-- (used server-side in API routes) can touch this table.

-- Atomic check-and-increment: buckets the current time into windows of
-- p_window_seconds, upserts the count for that bucket, and returns whether
-- the caller is still under p_max_requests. Race-safe under concurrent
-- requests via the upsert's `for update`-equivalent conflict handling.
create or replace function public.check_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_buckets (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limit_buckets.count + 1
  returning count into v_count;

  return v_count <= p_max_requests;
end;
$$;

-- Old buckets accumulate forever otherwise; prune anything past its window
-- whenever this function runs, cheap given the primary key is (key, window).
create or replace function public.prune_rate_limit_buckets()
returns void
language sql
as $$
  delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
$$;
