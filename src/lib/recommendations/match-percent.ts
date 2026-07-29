/**
 * Turns the ranked (already-sorted) blended scores of a user's actual final
 * recommendation set into display percentages. The raw blended score
 * (cosine similarity * 0.65 + a collaborative signal * 0.35, see engine.ts)
 * was never meant to be read as a percentage directly — cosine similarity
 * between text embeddings clusters in a narrow, model-specific band, and
 * the collaborative term is on a different scale entirely, so showing
 * Math.round(rawScore * 100) understated genuinely strong picks (a
 * legitimately great match could easily land in the 50s-60s).
 *
 * Instead, this calibrates relative to the user's own top-N candidates:
 * whatever made the cut to actually be shown IS, by definition, this
 * person's best available match right now, so it should read like one —
 * min-max normalized into a 75-98% band, preserving the original ranking
 * order. This is the same spirit as how Netflix's "% Match" behaves: a
 * confidence/UX signal calibrated to what's actually being recommended,
 * not a raw model score.
 */
const MATCH_PERCENT_FLOOR = 75;
const MATCH_PERCENT_CEILING = 98;
/** Used when there's nothing to normalize against (0-1 candidates) — a
 *  single flat value rather than snapping to the ceiling, which would
 *  otherwise happen from a min===max division. */
const SINGLE_CANDIDATE_PERCENT = 88;

export function calibrateMatchPercents(scoresInRankedOrder: number[]): number[] {
  if (scoresInRankedOrder.length === 0) return [];
  if (scoresInRankedOrder.length === 1) return [SINGLE_CANDIDATE_PERCENT];

  const min = Math.min(...scoresInRankedOrder);
  const max = Math.max(...scoresInRankedOrder);
  if (max - min < 1e-9) return scoresInRankedOrder.map(() => SINGLE_CANDIDATE_PERCENT);

  return scoresInRankedOrder.map((score) => {
    const normalized = (score - min) / (max - min);
    return Math.round(MATCH_PERCENT_FLOOR + normalized * (MATCH_PERCENT_CEILING - MATCH_PERCENT_FLOOR));
  });
}
