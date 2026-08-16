/**
 * "User curation is the key" — the recommendation engine used to treat
 * every account the same regardless of how much they'd actually rated: a
 * fixed band for how hard generic signals (context/weather/quality/genre)
 * could move a score, with no regard for how much real, explicit taste
 * signal existed for a given user.
 *
 * This models a single "curation confidence" in [0, 1] from how many
 * titles someone has explicitly rated highly (score >= 4 — the same set
 * that feeds the taste vector itself, see migration 0031), and the
 * adjustment band below scales off of it. A brand new account
 * (confidence ~0) still gets sensible defaults; a deeply curated one
 * (confidence ~1) gets a recommendation pipeline that trusts their own
 * taste far more than generic quality/context scores.
 *
 * This used to also drive a content-vs-collaborative blend weight
 * (computeBlendWeights, BlendWeights) -- removed along with
 * behavioral-collaborative.ts when collaborative filtering was pulled
 * from the solo recommendation engine entirely (see engine.ts's doc
 * comment: a pick should only ever be explainable by this user's own
 * curated ratings, never "people whose taste overlaps with yours"). Both
 * had gone dead -- referenced only by their own unit tests, nothing in
 * the live pipeline -- since that removal.
 */

/** Confidence reaches its max once someone has this many highly-rated
 *  titles — deliberately not "the more the better forever": a 500-rating
 *  power user isn't meaningfully more reliable than a 50-rating one, both
 *  are well past the point where the taste vector is trustworthy. */
const CURATION_SATURATION_COUNT = 50;

export function computeCurationConfidence(highRatedCount: number): number {
  return Math.max(0, Math.min(1, highRatedCount / CURATION_SATURATION_COUNT));
}

export interface AdjustmentBand {
  min: number;
  max: number;
}

const BASE_MIN_ADJUSTMENT = 0.45;
const BASE_MAX_ADJUSTMENT = 1.6;
const CONFIDENT_MIN_ADJUSTMENT = 0.7;
const CONFIDENT_MAX_ADJUSTMENT = 1.3;

/**
 * How much room generic signals (context/weather/quality/genre-affinity)
 * get to move a score away from the taste-based blend. A new user has
 * little personal curation to protect, so generic quality/context signals
 * legitimately carry more weight in deciding what's a good pick. A deeply
 * curated account should have its own taste dominate far more — generic
 * signals only get a light nudge, not a swing that can nearly double or
 * almost-halve the personalized score.
 */
export function computeAdjustmentBand(confidence: number): AdjustmentBand {
  return {
    min: BASE_MIN_ADJUSTMENT + (CONFIDENT_MIN_ADJUSTMENT - BASE_MIN_ADJUSTMENT) * confidence,
    max: BASE_MAX_ADJUSTMENT + (CONFIDENT_MAX_ADJUSTMENT - BASE_MAX_ADJUSTMENT) * confidence,
  };
}
