/**
 * Quality re-ranking. Prior to this, the recommendation score was 100%
 * taste-fit (content similarity + collaborative signal) with zero regard
 * for whether the title is actually any good — a genre/theme match with a
 * 3.5/10 weighted_rating scored identically to one with an 8.5/10. This is
 * the direct fix for that: a multiplier derived from titles.weighted_rating
 * (see 0009_weighted_rating.sql — a Bayesian average, already correctly
 * discounts small vote counts, so no re-derivation needed here).
 *
 * rt_critic_score (Rotten Tomatoes critic consensus, 0-100) is folded in
 * when available. This exists because weighted_rating alone missed real
 * critical bombs: Death Wish (2018) has weighted_rating 6.46 -- reads as
 * "fine, slightly below average" -- but an 18% RT critic score, i.e. the
 * actual consensus is "this is a bad movie." TMDB's audience score and RT's
 * critic score measure different things and can diverge sharply on exactly
 * this kind of "watchable but bad" title, so when both are present the
 * lower of the two is weighted more heavily -- a movie can't buy its way
 * out of a critical drubbing with a merely-mediocre audience score.
 *
 * Two layers on top of that blended rating:
 *
 *  1. passesQualityFloor() -- a HARD exclusion. Nothing below
 *     MIN_RECOMMENDABLE_RATING (or with no rating data at all) is ever
 *     shown as a recommendation, full stop. This used to be soft-only (a
 *     multiplier could dent a bad title's score without ever fully
 *     removing it, so a strong enough taste-fit could still push a
 *     mediocre-to-bad movie through) -- Death Wish (2018) is exactly that
 *     case: 0.785 content similarity was enough to outrun a 0.6x quality
 *     multiplier. Every caller MUST apply this filter before a title can
 *     be returned as a recommendation anywhere in the app.
 *
 *  2. qualityMultiplier() -- a softer re-ranking layered on top of taste-
 *     fit for whatever clears the hard floor above, so that among several
 *     similarly-good taste matches that are ALL "highly rated," the
 *     better-reviewed one still wins out. Not a replacement for taste-fit
 *     on its own -- sorting purely by rating would just recommend "The
 *     Godfather" to everyone regardless of what they actually like.
 */

const CATALOGUE_AVERAGE_RATING = 7.2; // same constant 0009 uses as its Bayesian prior
const MIN_RATING_FOR_FLOOR = 4.0;
const MAX_RATING_FOR_CEILING = 9.0;

const FLOOR_MULTIPLIER = 0.6;
const NEUTRAL_MULTIPLIER = 1.0;
const CEILING_MULTIPLIER = 1.3;

/** Titles with no vote history yet get a mild penalty in the multiplier --
 *  better to lead with something vetted than an unknown quantity, though
 *  this is soft enough that a genuinely great obscure match can still
 *  surface AMONG titles that already cleared the hard floor. An unrated
 *  title never clears passesQualityFloor() on its own, since "no rating
 *  data" can't be confirmed as "highly rated." */
const UNRATED_MULTIPLIER = 0.85;

/** When both weighted_rating and rt_critic_score are present, the lower
 *  (rescaled-to-10) of the two counts for this much of the blend -- see
 *  Death Wish example above. Weighted toward the worse score on purpose:
 *  a critical bomb shouldn't get bailed out by a so-so audience score. */
const WORSE_SCORE_WEIGHT = 0.7;

/**
 * "Only highly rated movies should be recommended" -- the hard cutoff.
 * 7.0/10 was picked by checking the actual distribution: the catalogue's
 * Bayesian-averaged weighted_rating clusters high (73.8% of movies clear
 * 6.5+ purely from the prior pulling small-vote-count titles toward the
 * 7.2 mean), so anything meaningfully below 7.0 has real signal behind a
 * genuinely mediocre-or-worse rating rather than just a thin vote count.
 * 7.0 still leaves a healthy candidate pool (roughly half of a real user's
 * raw content matches clear it in spot checks), while 7.5+ or 8+ narrows
 * the catalogue enough (2.1% / 0.3% respectively) to risk starving
 * recommendations for niche tastes.
 */
export const MIN_RECOMMENDABLE_RATING = 7.0;

export function qualityMultiplier(weightedRating: number | null, rtCriticScore: number | null = null): number {
  const effectiveRating = computeEffectiveRating(weightedRating, rtCriticScore);
  if (effectiveRating == null) return UNRATED_MULTIPLIER;

  const r = Math.max(MIN_RATING_FOR_FLOOR, Math.min(MAX_RATING_FOR_CEILING, effectiveRating));

  if (r <= CATALOGUE_AVERAGE_RATING) {
    const t = (r - MIN_RATING_FOR_FLOOR) / (CATALOGUE_AVERAGE_RATING - MIN_RATING_FOR_FLOOR);
    return FLOOR_MULTIPLIER + t * (NEUTRAL_MULTIPLIER - FLOOR_MULTIPLIER);
  }

  const t = (r - CATALOGUE_AVERAGE_RATING) / (MAX_RATING_FOR_CEILING - CATALOGUE_AVERAGE_RATING);
  return NEUTRAL_MULTIPLIER + t * (CEILING_MULTIPLIER - NEUTRAL_MULTIPLIER);
}

/** Hard gate -- see MIN_RECOMMENDABLE_RATING above. Returns false (i.e.
 *  "don't recommend this") for titles with no rating data at all, since
 *  "unknown quality" can't be confirmed as "highly rated." */
export function passesQualityFloor(weightedRating: number | null, rtCriticScore: number | null = null): boolean {
  const effectiveRating = computeEffectiveRating(weightedRating, rtCriticScore);
  if (effectiveRating == null) return false;
  return effectiveRating >= MIN_RECOMMENDABLE_RATING;
}

export function computeEffectiveRating(weightedRating: number | null, rtCriticScore: number | null): number | null {
  const rtOn10 = rtCriticScore == null ? null : rtCriticScore / 10;

  if (weightedRating == null) return rtOn10;
  if (rtOn10 == null) return weightedRating;

  const worse = Math.min(weightedRating, rtOn10);
  const better = Math.max(weightedRating, rtOn10);
  return worse * WORSE_SCORE_WEIGHT + better * (1 - WORSE_SCORE_WEIGHT);
}
