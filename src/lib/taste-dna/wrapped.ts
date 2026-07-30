/**
 * "Wrapped" — pure scoring logic (no I/O), same split as archetypes.ts /
 * evolution.ts. src/lib/taste-dna/compute.ts does the querying.
 *
 * Letterboxd's Year in Review is a static tally: count of films, average
 * rating, a bar chart of genres. This is meant to be the same "here's your
 * year" moment, but built on top of the Taste Graph instead of raw counts —
 * it reuses computeTasteDnaFromRatings (see archetypes.ts) so the headline
 * isn't just "you watched a lot of Drama," it's "you were a Neo-Noir person
 * this year," the same vocabulary the rest of the app already uses.
 */
import { computeTasteDnaFromRatings, type RatedTitleFeatures } from "./archetypes";

export interface WrappedRatedTitle extends RatedTitleFeatures {
  titleId: string;
  titleName: string;
  posterUrl: string | null;
  score: number;
  ratedAt: string;
  runtimeMinutes: number | null;
  tmdbVoteCount: number | null;
}

export interface WrappedTitleRef {
  id: string;
  name: string;
  posterUrl: string | null;
  score: number;
}

export interface WrappedResult {
  year: number;
  totalRated: number;
  totalHours: number;
  topGenres: { genre: string; count: number }[];
  topDirector: { id: string; name: string; count: number } | null;
  favoriteTitle: WrappedTitleRef | null;
  hiddenGem: WrappedTitleRef | null;
  topArchetype: { name: string; percent: number } | null;
  summary: string;
}

/** Below this many ratings in the period, there isn't enough to call it a
 *  "year" of anything — the page shows a "keep rating" placeholder instead. */
export const MIN_RATINGS_FOR_WRAPPED = 4;

/** A "hidden gem" needs an actual vote count to compare against, and a
 *  genuinely positive rating from the user — otherwise a title with no
 *  TMDB data at all would win by default, which isn't a real signal. */
const HIDDEN_GEM_MIN_SCORE = 4;

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function computeWrapped(rated: WrappedRatedTitle[], year: number): WrappedResult | null {
  if (rated.length < MIN_RATINGS_FOR_WRAPPED) return null;

  const totalRated = rated.length;
  const totalMinutes = rated.reduce((sum, r) => sum + (r.runtimeMinutes ?? 0), 0);
  const totalHours = Math.round(totalMinutes / 60);

  const genreCounts = new Map<string, number>();
  const directorCounts = new Map<string, { name: string; count: number }>();
  for (const r of rated) {
    for (const g of r.genres) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    if (r.directorId && r.directorName) {
      const existing = directorCounts.get(r.directorId);
      directorCounts.set(r.directorId, { name: r.directorName, count: (existing?.count ?? 0) + 1 });
    }
  }

  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre, count]) => ({ genre, count }));

  const topDirectorEntry = [...directorCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  // A single co-credited title shouldn't crown someone "your director of the
  // year" — needs to show up at least twice in what you rated this period.
  const topDirector =
    topDirectorEntry && topDirectorEntry[1].count >= 2
      ? { id: topDirectorEntry[0], name: topDirectorEntry[1].name, count: topDirectorEntry[1].count }
      : null;

  const favoriteSorted = [...rated].sort((a, b) => b.score - a.score);
  const favorite = favoriteSorted[0] ?? null;
  const favoriteTitle: WrappedTitleRef | null = favorite
    ? { id: favorite.titleId, name: favorite.titleName, posterUrl: favorite.posterUrl, score: favorite.score }
    : null;

  const gemCandidates = rated
    .filter((r) => r.score >= HIDDEN_GEM_MIN_SCORE && r.tmdbVoteCount != null)
    .sort((a, b) => a.tmdbVoteCount! - b.tmdbVoteCount!);
  const gem = gemCandidates[0] ?? null;
  const hiddenGem: WrappedTitleRef | null = gem
    ? { id: gem.titleId, name: gem.titleName, posterUrl: gem.posterUrl, score: gem.score }
    : null;

  const dna = computeTasteDnaFromRatings(rated);
  const topArchetype = dna.archetypes[0] && dna.archetypes[0].percent > 0 ? dna.archetypes[0] : null;

  const parts: string[] = [pluralize(totalRated, "film")];
  if (totalHours > 0) parts.push(`${pluralize(totalHours, "hour")} of screen time`);
  if (topArchetype) parts.push(`a strong ${topArchetype.name} streak`);
  else if (topGenres[0]) parts.push(`mostly ${topGenres[0].genre.toLowerCase()}`);
  const summary = `Your ${year}: ${parts.join(", ")}.`;

  return {
    year,
    totalRated,
    totalHours,
    topGenres,
    topDirector,
    favoriteTitle,
    hiddenGem,
    topArchetype,
    summary,
  };
}
