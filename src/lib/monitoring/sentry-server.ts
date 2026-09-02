import "server-only";
import { after } from "next/server";
import * as Sentry from "@sentry/node";

/**
 * Server-side Sentry. Previously this awaited Sentry.flush(2000) inline --
 * up to a full 2 extra seconds blocking the response every time an error
 * was captured. That was invisible on the happy path, but live tracing of
 * the movie page (see fetch-timeout.ts / migrations 0092-0093) found it
 * compounding directly on top of the exact failures those bounded
 * timeouts are *designed* to hit: a canceled statement_timeout is a real
 * Postgres error, more-like-this.tsx reports it via captureServerError,
 * and the old inline flush then added up to 2s more on top of the 2.5s
 * DB timeout -- nearly doubling the worst case this whole pass exists to
 * bound. captureServerError is called from 25 places across the app, so
 * this wasn't a one-page bug, it was a tax on every error-reporting path.
 *
 * Fix: use Next's after() (stable since Next 15, available here on 16.x)
 * to schedule the flush to run once the response has already been sent,
 * instead of blocking on it. captureException() itself is synchronous/
 * in-memory, so the error is still recorded immediately -- only the
 * network flush to Sentry's ingestion API moves off the request's
 * critical path.
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
  after(() => Sentry.flush(2000));
}
