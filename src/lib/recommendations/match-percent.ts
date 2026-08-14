/**
 * Turns the ranked (already-sorted) blended scores of a user's actual final
 * recommendation set into display percentages. The raw blended score
 * (cosine similarity between taste vector and title embedding, adjusted by
 * context/weather/quality/genre-affinity -- see engine.ts) was never meant
 * to be read as a percentage directly — cosine similarity between text
 * embeddings clusters in a narrow, model-specific band, so showing
 * Math.round(rawScore * 100) understated genuinely strong picks (a
 * legitimately great match could easily land in the 50s-60s).
 *
 * Calibrates relative to the user's own top-N candidates: whatever made
 * the cut to actually be shown IS, by definition, this person's best
 * available match right now. This is the same spirit as how Netflix's "%
 * Match" behaves: a confidence/UX signal calibrated to what's actually
 * being recommended, not a raw model score.
 *
 * The band itself (floor/ceiling of the displayed range) is no longer
 * fixed at 75-98 for every call. It used to be -- but a real accuracy
 * measurement run on 2026-08-14 (recommendation_impressions joined
 * forward to ratings, see analyze-rec-accuracy.ts) found the bottom of
 * that fixed floor carried a 69% miss rate (score <= 2.5) on a real
 * sample of 187 ratings -- actively worse than a coin flip, while still
 * being labeled "75% match." A fixed floor oversells a thin candidate
 * pool exactly as confidently as it describes a genuinely strong one.
 *
 * Fix: callers that have it can pass topRawSimilarity -- the un-adjusted
 * cosine similarity of the single best (#1 ranked) candidate, before any
 * context/weather/quality/genre-affinity multiplier touched it. That
 * multiplier-free number is the actual "how close is this person's best
 * available match to something they'd love" signal; the whole displayed
 * band scales down toward a much lower, more honest range when it's weak.
 * Callers that don't have a comparable raw-similarity number (e.g. the
 * companion/group blend in companion-recommendations.ts, whose score is a
 * fairness-weighted blend across multiple people's vectors, not a single
 * cosine similarity) can omit it and get the previous fixed-band behavior
 * unchanged.
 */
const CONFIDENT_FLOOR = 75;
const CONFIDENT_CEILING = 98;

/** Displayed band when the best available match is weak -- still a
 *  positive-sounding number (this is still someone's best option right
 *  now, no need to be bleak about it), but nowhere near the confident
 *  band, so a thin pool reads as "we're not that sure" rather than "we
 *  found you something great." */
const WEAK_FLOOR = 45;
const WEAK_CEILING = 65;

/** Raw cosine similarity anchors the band interpolates between. Below
 *  WEAK_ANCHOR, use the weak band outright; at/above CONFIDENT_ANCHOR, use
 *  the original confident band outright; linearly blend in between.
 *  CONFIDENT_ANCHOR intentionally sits well above CONTENT_MATCH_THRESHOLD
 *  (0.5, engine.ts) -- clearing the bar for a citeable "because you loved
 *  X" match is a lower ask than being confidently good on an absolute
 *  scale. WEAK_ANCHOR sits just above MIN_CONTENT_SIMILARITY (0.2) since
 *  anything near that inclusion floor is, definitionally, barely worth
 *  scoring at all. */
const WEAK_ANCHOR = 0.3;
const CONFIDENT_ANCHOR = 0.65;

function bandFor(topRawSimilarity: number | undefined): { floor: number; ceiling: number } {
  if (topRawSimilarity == null) return { floor: CONFIDENT_FLOOR, ceiling: CONFIDENT_CEILING };
  const t = Math.max(0, Math.min(1, (topRawSimilarity - WEAK_ANCHOR) / (CONFIDENT_ANCHOR - WEAK_ANCHOR)));
  return {
    floor: Math.round(WEAK_FLOOR + t * (CONFIDENT_FLOOR - WEAK_FLOOR)),
    ceiling: Math.round(WEAK_CEILING + t * (CONFIDENT_CEILING - WEAK_CEILING)),
  };
}

// Original single-candidate value (88, not the 75-98 midpoint of 86.5) --
// biased toward the ceiling since "this is the only thing to show" still
// reads as confident, not middling. Kept as a fraction of the confident
// band's range so a weak band derives its own proportionally-biased
// single value instead of the exact midpoint -- see calibrateMatchPercents.
const CONFIDENT_SINGLE = 88;
const SINGLE_BIAS = (CONFIDENT_SINGLE - CONFIDENT_FLOOR) / (CONFIDENT_CEILING - CONFIDENT_FLOOR);

export function calibrateMatchPercents(scoresInRankedOrder: number[], topRawSimilarity?: number): number[] {
  if (scoresInRankedOrder.length === 0) return [];

  const { floor, ceiling } = bandFor(topRawSimilarity);
  // Used when there's nothing to normalize against (0-1 candidates) — a
  // single flat value rather than snapping to the ceiling, which would
  // otherwise happen from a min===max division. When topRawSimilarity is
  // omitted (floor/ceiling === 75/98), this reproduces the original flat
  // 88 exactly.
  const singleCandidatePercent = Math.round(floor + SINGLE_BIAS * (ceiling - floor));

  if (scoresInRankedOrder.length === 1) return [singleCandidatePercent];

  const min = Math.min(...scoresInRankedOrder);
  const max = Math.max(...scoresInRankedOrder);
  if (max - min < 1e-9) return scoresInRankedOrder.map(() => singleCandidatePercent);

  return scoresInRankedOrder.map((score) => {
    const normalized = (score - min) / (max - min);
    return Math.round(floor + normalized * (ceiling - floor));
  });
}
