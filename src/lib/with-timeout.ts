/**
 * Races a promise against a timeout so a single slow/stuck downstream call
 * (a Postgres query queued behind an exhausted connection pool, a stalled
 * fetch with no server-side timeout of its own, etc.) can never hang an
 * entire page render forever. On timeout, resolves to `fallback` instead of
 * rejecting -- callers that can gracefully degrade (e.g. "skip this one
 * optional section") should prefer this over letting the page error out.
 *
 * Note this doesn't cancel the underlying work (Supabase's client doesn't
 * expose an AbortSignal on .rpc()/.from() chains), it just stops waiting on
 * it -- the query may still complete server-side after we've moved on.
 *
 * `onDegraded`, if provided, fires exactly once whenever the fallback ends
 * up being used -- either because the timeout fired first or because the
 * underlying promise rejected. This exists because "resolved to fallback"
 * and "resolved to the real value" were previously indistinguishable from
 * the outside: a caller had no way to know a page was served on degraded
 * signal, only that a request completed. Recommendation intelligence audit
 * finding #5 -- see log-impressions.ts, which threads this into
 * recommendation_impressions.degraded_signals so degradation is queryable
 * after the fact instead of silent.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
  onDegraded?: (reason: "timeout" | "error", error?: unknown) => void
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onDegraded?.("timeout");
      resolve(fallback);
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        onDegraded?.("error", error);
        resolve(fallback);
      }
    );
  });
}
