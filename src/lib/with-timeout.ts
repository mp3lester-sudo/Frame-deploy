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
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}
