/**
 * Shared timeout for every live third-party API call this app makes on a
 * per-request path (OMDb, TMDB reviews/watch-providers -- see
 * rotten-tomatoes.ts, tmdb-reviews.ts, tmdb-watch-providers.ts).
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

/**
 * Separate, longer timeout for the TMDB trailer lookup specifically (see
 * tmdb-videos.ts). It's just as isolated behind its own <Suspense> boundary
 * as everything else sharing EXTERNAL_FETCH_TIMEOUT_MS above -- so, unlike
 * that constant's own reasoning, a longer wait here doesn't cost the rest
 * of the page anything. But a miss here is uniquely visible: RT score or
 * review-count fetches failing quietly drop a small badge/section, while a
 * trailer timeout means the entire backdrop hero silently reverts to a
 * plain still image with no trailer, no play button, nothing -- on every
 * cold cache (first view of a title in a rolling 24h window, per the
 * revalidate: 86400 in tmdb-videos.ts), a TMDB response even a little
 * slower than 2.5s under ordinary jitter was enough to trigger this and
 * made trailers feel randomly broken. 6s gives real network variance room
 * without ever blocking anything else on the page.
 */
export const TRAILER_FETCH_TIMEOUT_MS = 6000;
