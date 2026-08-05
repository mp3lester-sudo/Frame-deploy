/**
 * Next.js's built-in server-error hook -- fires for uncaught errors in
 * Server Components, Route Handlers, and Server Actions across the whole
 * app, so route handlers and server actions don't each need their own
 * try/catch-and-report wiring. Client-side render errors are separately
 * reported from error.tsx/global-error.tsx, which this hook can't see.
 *
 * Guarded to the nodejs runtime only -- this project's middleware.ts runs
 * on the Edge runtime, and instrumentation.ts is compiled once per
 * runtime (Next statically replaces NEXT_RUNTIME per build pass, so this
 * branch is fully dead-code-eliminated from the edge bundle rather than
 * evaluated at request time). @sentry/node relies on Node-only APIs that
 * don't exist on Edge; without this guard, Next would try to bundle it
 * into the edge build and fail.
 */
export async function onRequestError(error: unknown) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureServerError } = await import("@/lib/monitoring/sentry-server");
  const { logDebugError } = await import("@/lib/monitoring/debug-log");
  await Promise.all([captureServerError(error), logDebugError(error)]);
}
