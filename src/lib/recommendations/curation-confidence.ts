/**
 * "User curation is the key" — the recommendation engine used to treat
 * every account the same regardless of how much they'd actually rated: a
 * fixed 65/35 content-vs-collaborative blend, and a fixed band for how
 * hard generic signals (context/weather/quality/genre) could move a score.
 * Neither scaled with how much real, explicit taste signal existed for a
 * given user.
 *
 * This models a single "curation confidence" in [0, 1] from how many
 * titles someone has explicitly rated highly (score >= 4 — the same set
 * that feeds the taste vector itself, see migration 0031), and everything
 * downstream (blend weights, adjustment band) scales off of it. A brand
 * new account (confidence ~0) still gets sensible defaults; a deeply
 * curated one (confidence ~1) gets a recommendation pipeline that trusts
 * their own taste far more than the crowd or generic quality scores.
 */

/** Confidence reaches its max once someone has this many highly-rated
 *  titles — deliberately not "the more the better forever": a 500-rating
 *  power user isn't meaningfully more reliable than a 50-rating one, both
 *  are well past the point where the taste vector is trustworthy. */
const CURATION_SATURATION_COUNT = 50;

export function computeCurationConfidence(highRatedCount: number): number {
  return Math.max(0, Math.min(1, highRatedCount / CURATION_SATURATION_COUNT));
}

export interface BlendWeights {
  vectorWeight: number;
  collaborativeWeight: number;
}

const MIN_VECTOR_WEIGHT = 0.65;
const MAX_VECTOR_WEIGHT = 0.85;

/**
 * Content-vs-collaborative split for blending a candidate's score. Thin
 * curation history leans more on what similar users liked, since the
 * personal taste vector alone is built from too little evidence to trust
 * on its own; deep, well-established curation shifts weight toward the
 * user's own vector, which by that point is a far more reliable predictor
 * of their taste than the crowd.
 */
export function computeBlendWeights(confidence: number): BlendWeights {
  const vectorWeight = MIN_VECTOR_WEIGHT + (MAX_VECTOR_WEIGHT - MIN_VECTOR_WEIGHT) * confidence;
  return { vectorWeight, collaborativeWeight: 1 - vectorWeight };
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
