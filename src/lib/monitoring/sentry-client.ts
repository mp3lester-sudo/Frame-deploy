"use client";

import * as Sentry from "@sentry/browser";

/**
 * Lazy singleton client-side Sentry init, same no-op-without-key pattern
 * as posthog-client.ts -- local dev and any preview deploy without
 * NEXT_PUBLIC_SENTRY_DSN configured just skips error reporting instead of
 * throwing on a missing DSN.
 */
let initialized = false;

function ensureInit() {
  if (initialized) return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Session replay is a paid-tier Sentry feature and not something this
    // app needs -- keeping this to plain error capture avoids surprising
    // usage-based billing the moment a DSN is added.
  });
  initialized = true;
}

/** Call from client error boundaries (error.tsx, global-error.tsx). */
export function captureClientError(error: unknown, context?: Record<string, unknown>) {
  ensureInit();
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
