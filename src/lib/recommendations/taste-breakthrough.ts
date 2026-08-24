import { computeGenreAffinity, type RatedTitleForAffinity } from "./genre-affinity";

/**
 * "Taste breakthrough" moment (magic-moments audit) -- most ratings are
 * unremarkable confirmations of taste the app already knows about. This
 * detects the rare rating that's actually new information: a loved rating
 * for a genre the person has no established affinity for yet. Reuses
 * computeGenreAffinity's own MIN_OCCURRENCES evidence bar (the same "don't
 * fake it" bar as favorite-director-alerts.ts and every other genre-signal
 * consumer in this codebase) so "new territory" means genuinely new, not
 * just a genre they happen to have skipped rating twice.
 */

const LOVED_SCORE_THRESHOLD = 4;

/** A genre counts as "already established" (not a breakthrough) once
 *  affinity clears this bar -- deliberately lower than genreAffinityNote's
 *  0.4 user-facing bar, since "not yet a clear favorite" is a wider net
 *  than "not yet loved at all." */
const ESTABLISHED_AFFINITY_THRESHOLD = 0.15;

export interface TasteBreakthrough {
  genre: string;
}

/**
 * Pure: given every prior rating (with each title's genres) and the title/
 * score just rated, decide whether this rating opened new genre territory.
 * priorRatings should exclude the just-written rating -- it represents
 * "what we knew before this one landed."
 */
export function detectTasteBreakthrough(
  priorRatings: RatedTitleForAffinity[],
  newRating: { score: number; genres: string[] | null }
): TasteBreakthrough | null {
  if (newRating.score < LOVED_SCORE_THRESHOLD) return null;

  const genres = newRating.genres ?? [];
  if (genres.length === 0) return null;

  const priorAffinity = computeGenreAffinity(priorRatings);

  const newTerritoryGenre = genres.find((genre) => {
    const entry = priorAffinity.get(genre);
    // No entry at all (never rated this genre twice before) or an entry
    // that hasn't cleared the "established" bar both count as new
    // territory -- the point is "you didn't already know you liked this."
    return !entry || entry.affinity < ESTABLISHED_AFFINITY_THRESHOLD;
  });

  return newTerritoryGenre ? { genre: newTerritoryGenre } : null;
}
