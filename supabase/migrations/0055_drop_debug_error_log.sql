-- Drops the throwaway diagnostic table added in migration 0050 for the
-- logout-500 investigation. That bug is fixed and confirmed live (see
-- push.ts illegal const export fix + client-side signOut wrapper), and
-- the table was explicitly scoped as safe to drop once the real fix
-- shipped. Sentry (src/lib/monitoring/sentry-server.ts) remains as the
-- sole server-error reporting path going forward.
drop table if exists debug_error_log;
