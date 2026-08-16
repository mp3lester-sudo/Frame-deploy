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

// A brand new account has almost nothing else to go on -- watchlist adds
// and half-finished watches are proportionally a much bigger share of
// what's actually known about their taste than they are for someone with
// 50 explicit ratings already anchoring a taste vector. So the boost caps
// above scale UP as curation-confidence.ts's confidence score goes DOWN,
// capped at this multiplier (chosen so the combined max boost at zero
// confidence, 0.325 + 0.156 = 0.481, still stays under
// dislike-penalty.ts's MAX_DISLIKE_PENALTY of 0.5 -- implicit signals
// should never be able to outweigh an explicit one, at any confidence
// level). A deeply curated account (confidence 1) gets exactly the base
// caps, unchanged from before this scaling existed.
const LOW_CONFIDENCE_BOOST_SCALE = 1.3;

function boostScale(curationConfidence: number): number {
  return LOW_CONFIDENCE_BOOST_SCALE - (LOW_CONFIDENCE_BOOST_SCALE - 1) * curationConfidence;
}

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

/**
 * curationConfidence defaults to 1 (i.e. no scaling, the original fixed
 * caps) so every existing caller that doesn't pass it behaves exactly as
 * before -- only engine.ts, which already computes confidence per
 * request for computeAdjustmentBand, needs to thread it through.
 */
export function implicitAffinityMultiplier(
  maxSimilarityToWatchlist: number,
  maxSimilarityToWatchedUnrated: number,
  matchThreshold: number,
  curationConfidence: number = 1
): number {
  const scale = boostScale(curationConfidence);
  const watchlistDelta = rampDelta(maxSimilarityToWatchlist, matchThreshold, MAX_WATCHLIST_BOOST * scale);
  const watchedUnratedDelta = rampDelta(
    maxSimilarityToWatchedUnrated,
    matchThreshold,
    MAX_WATCHED_UNRATED_BOOST * scale
  );
  return 1 + watchlistDelta + watchedUnratedDelta;
}
