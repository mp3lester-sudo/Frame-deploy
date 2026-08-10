/**
 * Penalizes a candidate that's embedding-close to something the user
 * explicitly disliked (a low rating) -- the missing negative counterpart
 * to the "because you loved X" citation logic already in engine.ts
 * (CONTENT_MATCH_THRESHOLD). Genre-affinity.ts already softens whole
 * genres a user rates low; this operates at the individual title level
 * instead, so one specific disliked film can suppress its close neighbors
 * even within a genre the user otherwise likes.
 *
 * Below the similarity threshold, no penalty at all -- a loose, generic
 * resemblance to something disliked isn't a real signal, and reusing
 * CONTENT_MATCH_THRESHOLD here keeps "close enough to matter" consistent
 * between the positive and negative cases. Above it, the penalty scales
 * linearly up to MAX_DISLIKE_PENALTY as similarity approaches a
 * near-identical match -- a soft nudge summed with every other adjustment
 * in engine.ts (see the "sum of deltas, not a product" comment there),
 * not a hard exclusion. A single disliked title shouldn't be able to veto
 * an otherwise-strong pick outright.
 */
const MAX_DISLIKE_PENALTY = 0.5;

// Threshold is a parameter (not imported from engine.ts) specifically to
// avoid a circular import -- engine.ts is the one calling this, passing
// its own CONTENT_MATCH_THRESHOLD through, so that constant stays the
// single source of truth without the two modules importing each other.
export function dislikePenaltyMultiplier(maxSimilarityToDisliked: number, matchThreshold: number): number {
  if (maxSimilarityToDisliked <= matchThreshold) return 1;
  const t = (maxSimilarityToDisliked - matchThreshold) / (1 - matchThreshold);
  return 1 - t * MAX_DISLIKE_PENALTY;
}
