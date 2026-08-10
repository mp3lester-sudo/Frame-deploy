/**
 * Rewards a candidate that's embedding-close to something the user has
 * shown implicit interest in -- a watchlist add, or a title they watched
 * but never got around to rating (see similarity_to_implicit_positive_
 * titles, migration 0053). Only explicit ratings drove any signal before
 * this; both of those are real behavior sitting unused.
 *
 * Mirrors dislike-penalty.ts's shape exactly (same threshold-gated linear
 * ramp), but the max swing is deliberately smaller -- MAX_IMPLICIT_BOOST
 * (0.2) vs. MAX_DISLIKE_PENALTY (0.5) -- because implicit signals are
 * weaker evidence than explicit ones. Watchlisting something is "I'm
 * curious," not "I loved this"; watching something without rating it
 * could mean anything from love to indifference to a solo half-watch. A
 * genuine top-rated match should always outweigh an implicit one, so this
 * nudges rather than competes with the real content/collaborative signal.
 */
const MAX_IMPLICIT_BOOST = 0.2;

// Threshold is a parameter (not a shared import) for the same reason as
// dislike-penalty.ts's matchThreshold -- callers pass engine.ts's
// CONTENT_MATCH_THRESHOLD through directly, avoiding a circular import
// while keeping "close enough to matter" consistent across all three
// (citation, dislike penalty, implicit boost).
export function implicitAffinityMultiplier(maxSimilarityToImplicitPositive: number, matchThreshold: number): number {
  if (maxSimilarityToImplicitPositive <= matchThreshold) return 1;
  const t = (maxSimilarityToImplicitPositive - matchThreshold) / (1 - matchThreshold);
  return 1 + t * MAX_IMPLICIT_BOOST;
}
