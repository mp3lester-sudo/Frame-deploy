/**
 * Quality re-ranking. Prior to this, the recommendation score was 100%
 * taste-fit (content similarity + collaborative signal) with zero regard
 * for whether the title is actually any good — a genre/theme match with a
 * 3.5/10 weighted_rating scored identically to one with an 8.5/10. This is
 * the direct fix for that: a multiplier derived from titles.weighted_rating
 * (see 0009_weighted_rating.sql — a Bayesian average, already correctly
 * discounts small vote counts, so no re-derivation needed here).
 *
 * Deliberately a multiplier layered on top of taste-fit, not a replacement
 * for it — sorting purely by rating would just recommend "The Godfather"
 * to everyone regardless of what they actually like. This nudges the
 * ranking so that, among similarly-good taste matches, the better-reviewed
 * one wins, and a title with no vote history yet doesn't rank alongside
 * well-vetted acclaimed titles on an equal footing.
 */

const CATALOGUE_AVERAGE_RATING = 7.2; // same constant 0009 uses as its Bayesian prior
const MIN_RATING_FOR_FLOOR = 4.0;
const MAX_RATING_FOR_CEILING = 9.0;

const FLOOR_MULTIPLIER = 0.6;
const NEUTRAL_MULTIPLIER = 1.0;
const CEILING_MULTIPLIER = 1.3;

/** Titles with no vote history yet get a mild penalty — better to lead with
 *  something vetted than an unknown quantity, though this is soft enough
 *  that a genuinely great obscure match can still surface. */
const UNRATED_MULTIPLIER = 0.85;

export function qualityMultiplier(weightedRating: number | null): number {
  if (weightedRating == null) return UNRATED_MULTIPLIER;

  const r = Math.max(MIN_RATING_FOR_FLOOR, Math.min(MAX_RATING_FOR_CEILING, weightedRating));

  if (r <= CATALOGUE_AVERAGE_RATING) {
    const t = (r - MIN_RATING_FOR_FLOOR) / (CATALOGUE_AVERAGE_RATING - MIN_RATING_FOR_FLOOR);
    return FLOOR_MULTIPLIER + t * (NEUTRAL_MULTIPLIER - FLOOR_MULTIPLIER);
  }

  const t = (r - CATALOGUE_AVERAGE_RATING) / (MAX_RATING_FOR_CEILING - CATALOGUE_AVERAGE_RATING);
  return NEUTRAL_MULTIPLIER + t * (CEILING_MULTIPLIER - NEUTRAL_MULTIPLIER);
}
