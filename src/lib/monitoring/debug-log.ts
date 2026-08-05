import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Stopgap alongside captureServerError() (sentry-server.ts) for the
 * logout-500 investigation -- this sandbox has no Sentry dashboard access,
 * so production errors that only surface a digest client-side are
 * otherwise a dead end. Writes the real message/stack to debug_error_log
 * (migration 0050) via the service-role client, which bypasses RLS
 * regardless of the failing request's own auth state.
 *
 * Deliberately never throws -- a failure to log a debug row must never
 * turn into a second, different error on top of the one being logged.
 * Silently no-ops without SUPABASE_SERVICE_ROLE_KEY rather than crashing
 * local/preview environments that may not have it set.
 */
export async function logDebugError(error: unknown, extra?: Record<string, unknown>) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const err = error instanceof Error ? error : null;
    const digest =
      error && typeof error === "object" && "digest" in error
        ? String((error as { digest?: unknown }).digest)
        : null;
    await createServiceRoleClient()
      .from("debug_error_log")
      .insert({
        digest,
        message: err?.message ?? String(error),
        stack: err?.stack ?? null,
        extra: extra ?? null,
      });
  } catch {
    // Never let debug logging itself throw -- see comment above.
  }
}
