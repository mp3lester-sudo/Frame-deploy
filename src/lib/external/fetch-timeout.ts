/**
 * Shared timeout for every live third-party API call this app makes on a
 * per-request path (OMDb, TMDB reviews/trailer/watch-providers -- see
 * rotten-tomatoes.ts, tmdb-reviews.ts, tmdb-videos.ts, tmdb-watch-providers.ts).
 *
 * These all sit behind their own <Suspense> boundary on the movie page
 * (streamed independently since none of them gate the rest of the page --
 * see movie/[id]/page.tsx), but an unbounded call still means an unbounded
 * wait for whichever one is slowest, and third-party APIs have no SLA.
 * 2.5s is generous for a same-region API call under normal conditions but
 * short enough that a stalled upstream can never turn into the multi-second
 * hangs this was originally built to fix. Each caller's existing catch
 * block already treats a timeout exactly like any other network failure
 * (soft-fail, no cache write, retried on the title's next view) -- this
 * constant doesn't change that behavior, only how long it takes to trigger.
 */
export const EXTERNAL_FETCH_TIMEOUT_MS = 2500;
