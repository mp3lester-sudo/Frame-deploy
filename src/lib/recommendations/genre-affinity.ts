/**
 * Genre-level negative signal. Before this, the only thing standing between
 * a candidate and the final recommendation list was one blended embedding +
 * collaborative score — genre-agnostic. A user who's rated every Horror
 * title they've logged 1/5 could still get a Horror pick with strong
 * content/collaborative similarity, because nothing in the scoring path
 * ever asked "does this person actually like this genre." This is the fix:
 * a per-user, per-genre signed affinity derived straight from their own
 * ratings, applied as a mild multiplier alongside context/weather/quality.
 *
 * Deliberately genre-level, not just title-level — the taste vector already
 * captures "this specific title resembles things you liked"; this captures
 * "you've told us, repeatedly, that you don't like this category," which a
 * single averaged embedding can't represent (one bad genre only nudges the
 * whole vector a little, it can't zero out a category).
 */

const RATING_MIDPOINT = 2.5; // out of 5 — same convention as upsert_taste_vector_from_rating's weight
const RATING_SPAN = 2.5;

/** A genre needs at least this many rated occurrences before its affinity
 *  counts for anything — one 0.5-star fluke shouldn't blacklist a whole
 *  genre. Below the threshold it's treated as unknown (neutral). */
const MIN_OCCURRENCES = 2;

/** How strongly affinity can move a candidate's score, scaled by how much
 *  evidence backs it up: a genre seen only MIN_OCCURRENCES times swings at
 *  most MIN_MULTIPLIER_SWING (a light nudge — two data points could still
 *  be a fluke); a genre seen FULL_CONFIDENCE_COUNT+ times swings up to
 *  MAX_MULTIPLIER_SWING (a genre you've clearly, repeatedly hated or loved
 *  should pull harder than a hunch based on two ratings). This used to be
 *  one flat cap regardless of sample size — someone who's rated 40 Horror
 *  titles 1/5 and someone who's rated 2 Horror titles 1/5 got an identical
 *  ceiling, which under-weights exactly the kind of deep, consistent
 *  curation this product is supposed to trust most. */
const MIN_MULTIPLIER_SWING = 0.12;
const MAX_MULTIPLIER_SWING = 0.3;
const FULL_CONFIDENCE_COUNT = 10;

export interface RatedTitleForAffinity {
  score: number;
  genres: string[] | null;
}

export interface GenreAffinityEntry {
  /** Signed affinity in [-1, 1] — negative means "rates this genre below
   *  average," positive means above. */
  affinity: number;
  /** How many rated titles fed this genre's affinity — the confidence
   *  signal genreAffinityMultiplier uses to scale its swing. */
  count: number;
}

/**
 * Signed affinity per genre, in roughly [-1, 1] — negative means "this
 * person tends to rate this genre below average," positive means above.
 * Genres with fewer than MIN_OCCURRENCES ratings are omitted entirely
 * (treated as unknown, not neutral-zero, so they don't get invented data).
 */
export function computeGenreAffinity(ratings: RatedTitleForAffinity[]): Map<string, GenreAffinityEntry> {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();

  for (const { score, genres } of ratings) {
    const signed = (score - RATING_MIDPOINT) / RATING_SPAN; // -1 (0.5★) .. +1 (5★)
    for (const genre of genres ?? []) {
      sums.set(genre, (sums.get(genre) ?? 0) + signed);
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  const affinity = new Map<string, GenreAffinityEntry>();
  for (const [genre, count] of counts) {
    if (count < MIN_OCCURRENCES) continue;
    const avg = Math.max(-1, Math.min(1, (sums.get(genre) ?? 0) / count));
    affinity.set(genre, { affinity: avg, count });
  }
  return affinity;
}

/**
 * Averages affinity across whichever of the candidate's genres we have data
 * for (unknown genres are skipped, not treated as neutral-zero, so a title
 * with one known-hated genre and two unrated genres still gets the full
 * penalty rather than it being diluted by unknowns). No known genres at all
 * returns 1 (no opinion, no adjustment).
 *
 * Each known genre's own swing is scaled by its own confidence (occurrence
 * count) before averaging, so a well-established genre preference pulls
 * harder than a genre a candidate barely overlaps with a two-rating hunch.
 */
export function genreAffinityMultiplier(titleGenres: string[] | null, affinity: Map<string, GenreAffinityEntry>): number {
  const known = (titleGenres ?? [])
    .map((g) => affinity.get(g))
    .filter((a): a is GenreAffinityEntry => a != null);
  if (known.length === 0) return 1;

  const perGenreMultipliers = known.map(({ affinity: a, count }) => {
    const confidence = Math.max(
      0,
      Math.min(1, (count - MIN_OCCURRENCES) / (FULL_CONFIDENCE_COUNT - MIN_OCCURRENCES))
    );
    const swing = MIN_MULTIPLIER_SWING + (MAX_MULTIPLIER_SWING - MIN_MULTIPLIER_SWING) * confidence;
    return 1 + a * swing;
  });

  return perGenreMultipliers.reduce((sum, m) => sum + m, 0) / perGenreMultipliers.length;
}
