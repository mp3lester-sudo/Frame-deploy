-- Temporary diagnostic table for the logout-500 investigation.
--
-- Production errors from the Server Components render pipeline come back
-- to the client with only a digest -- Next.js deliberately omits the real
-- message/stack in production builds to avoid leaking sensitive details.
-- Normally Sentry (see src/lib/monitoring/sentry-server.ts) would carry
-- the real detail, but this environment has no Sentry dashboard access,
-- so this table is a stopgap: onRequestError (src/instrumentation.ts)
-- writes the same error here as a plain, directly-queryable row, using
-- the service-role client so it bypasses RLS regardless of what auth
-- state the failing request was in.
--
-- No RLS policies are added deliberately -- with RLS enabled and zero
-- policies, anon/authenticated clients get nothing back at all, and only
-- the service-role client (which always bypasses RLS) can read or write.
-- This is intentionally throwaway: safe to drop once the underlying bug
-- is found and fixed.
create table if not exists debug_error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  digest text,
  message text,
  stack text,
  extra jsonb
);

alter table debug_error_log enable row level security;
