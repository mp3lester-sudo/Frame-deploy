import { genreAffinityMultiplier, type GenreAffinityEntry } from "@/lib/recommendations/genre-affinity";
import type { ControversyScore } from "./rank";

// A rating this high on the exact reviewed title is a much stronger
// signal than genre affinity alone ("you loved this specific movie, here's
// a hot take about it"), so it gets its own dedicated boost rather than
// being folded into the genre multiplier below.
const OWN_RATING_THRESHOLD = 4; // out of 5
const OWN_RATING_BOOST = 0.35;

export interface HotTakeAffinityInput {
  titleGenres: string[] | null;
  /** This viewer's own rating (0-5) of the reviewed title, or null if
   *  they haven't rated it. */
  viewerRatingForTitle: number | null;
}

/**
 * Boosts (never replaces) a controversy score with this viewer's own
 * genre affinity and, if present, their own rating of the exact reviewed
 * title -- personalization audit finding: Hot Takes ranked identically
 * for every viewer regardless of taste, despite a passionate take about a
 * movie someone loved being a much more compelling read than an equally
 * controversial one about a movie they've never heard of. Controversy
 * stays the dominant, primary signal (this is fundamentally a "hot
 * takes" feed, not a recommendation rail) -- affinity only ever nudges
 * within that ordering via genreAffinityMultiplier's existing bounded
 * swing (roughly 1 +/- 0.3, same as every other surface that uses it), it
 * never lets a mild take about a favorite genre outrank a genuinely more
 * controversial one about something the viewer has no signal on.
 */
export function personalizedHotTakeScore(
  controversyScore: number,
  input: HotTakeAffinityInput,
  genreAffinity: Map<string, GenreAffinityEntry>
): number {
  const genreMultiplier = genreAffinityMultiplier(input.titleGenres, genreAffinity);
  const ownRatingBoost =
    input.viewerRatingForTitle !== null && input.viewerRatingForTitle >= OWN_RATING_THRESHOLD ? OWN_RATING_BOOST : 0;
  return controversyScore * genreMultiplier * (1 + ownRatingBoost);
}

/**
 * Re-ranks an already controversy-filtered/sorted list (rankByControversy)
 * by blending in personalized affinity. Ties -- most commonly a
 * cold-start viewer with no rating history, or a candidate whose genres
 * are all unknown to this viewer's affinity map -- fall back to the
 * original controversy order rather than an arbitrary one.
 */
export function rankHotTakesForViewer<T extends ControversyScore & HotTakeAffinityInput>(
  candidates: T[],
  genreAffinity: Map<string, GenreAffinityEntry>
): T[] {
  return candidates
    .map((c, index) => ({ c, index, score: personalizedHotTakeScore(c.score, c, genreAffinity) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.c);
}
