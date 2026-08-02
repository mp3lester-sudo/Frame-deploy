/**
 * Next.js's built-in server-error hook -- fires for uncaught errors in
 * Server Components, Route Handlers, and Server Actions across the whole
 * app, so route handlers and server actions don't each need their own
 * try/catch-and-report wiring. Client-side render errors are separately
 * reported from error.tsx/global-error.tsx, which this hook can't see.
 */
export async function onRequestError(error: unknown) {
  const { captureServerError } = await import("@/lib/monitoring/sentry-server");
  await captureServerError(error);
}
