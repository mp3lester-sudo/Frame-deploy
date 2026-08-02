import "server-only";
import * as Sentry from "@sentry/node";

/**
 * Server-side Sentry, following the same lazy-init/no-op-without-key and
 * explicit-flush-before-returning pattern as captureServerEvent() in
 * analytics/posthog-server.ts -- serverless functions don't stay warm long
 * enough to trust background flushing, so every capture here is flushed
 * before the caller continues.
 */
let initialized = false;

function ensureInit(): boolean {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return false;
  if (!initialized) {
    Sentry.init({ dsn, tracesSampleRate: 0.1 });
    initialized = true;
  }
  return true;
}

export async function captureServerError(error: unknown, context?: Record<string, unknown>) {
  if (!ensureInit()) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
  await Sentry.flush(2000);
}
