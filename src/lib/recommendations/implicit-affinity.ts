/**
 * Rewards a candidate that's embedding-close to something the user has
 * shown implicit interest in -- see similarity_to_implicit_positive_titles
 * (migration 0060) and 0053's original comment for why this exists at all:
 * only explicit ratings drove any signal before it, and both watchlisting
 * and watching-without-rating are real behavior sitting unused.
 *
 * Split into two separately-weighted signals (migration 0060) rather than
 * one merged one (the original 0053 shape): a watchlist add is deliberate,
 * forward-looking curation -- "I looked at this and decided I want to
 * watch it" -- closer in spirit to an explicit positive than to a shrug.
 * Watching something and never rating it is genuinely ambiguous -- love-
 * and-forgot, mild indifference, and a half-watched bail-out all look
 * identical in watch_history with no completion/progress data to tell
 * them apart -- so it earns a meaningfully smaller boost. Treating both
 * as one signal let the weaker, noisier one move scores exactly as much
 * as the stronger one, which was never the intent.
 *
 * Both ramps are still well below MAX_DISLIKE_PENALTY (0.5, dislike-
 * penalty.ts) even combined -- implicit signals, however split, should
 * never be able to outweigh a genuine explicit negative.
 */
const MAX_WATCHLIST_BOOST = 0.25;
const MAX_WATCHED_UNRATED_BOOST = 0.12;

// Threshold is a parameter (not a shared import) for the same reason as
// dislike-penalty.ts's matchThreshold -- callers pass engine.ts's
// CONTENT_MATCH_THRESHOLD through directly, avoiding a circular import
// while keeping "close enough to matter" consistent across all three
// (citation, dislike penalty, implicit boost).
function rampDelta(similarity: number, matchThreshold: number, maxBoost: number): number {
  if (similarity <= matchThreshold) return 0;
  const t = (similarity - matchThreshold) / (1 - matchThreshold);
  return t * maxBoost;
}

export function implicitAffinityMultiplier(
  maxSimilarityToWatchlist: number,
  maxSimilarityToWatchedUnrated: number,
  matchThreshold: number
): number {
  const watchlistDelta = rampDelta(maxSimilarityToWatchlist, matchThreshold, MAX_WATCHLIST_BOOST);
  const watchedUnratedDelta = rampDelta(maxSimilarityToWatchedUnrated, matchThreshold, MAX_WATCHED_UNRATED_BOOST);
  return 1 + watchlistDelta + watchedUnratedDelta;
}
