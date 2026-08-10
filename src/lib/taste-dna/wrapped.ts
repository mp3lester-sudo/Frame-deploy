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
  /** Posters from the period's rated titles, highest-scored first, deduped
   *  and capped -- backs the full-bleed poster backdrop on stat slides
   *  (WrappedStory) that don't otherwise have one title of their own to
   *  show. Deliberately just a plain list of URLs, not full title refs --
   *  nothing downstream needs to link back to a specific title from these,
   *  only render them as ambient imagery. */
  backdropPosterUrls: string[];
}

/** Below this many ratings in the period, there isn't enough to call it a
 *  "year" of anything — the page shows a "keep rating" placeholder instead. */
export const MIN_RATINGS_FOR_WRAPPED = 4;

/**
 * UTC calendar-month bounds for the monthly recap, plus the display label
 * used in its headline/summary ("July 2026"). Pure and unit-tested
 * separately from the Supabase-touching fetch in compute.ts, same split as
 * everything else in this file.
 */
export function getMonthRange(now: Date): { start: string; end: string; label: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1)).toISOString();
  const end = new Date(Date.UTC(year, month + 1, 1)).toISOString();
  const label = new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start, end, label };
}

/**
 * UTC calendar-week bounds (Monday-Sunday) for the Auteur-exclusive weekly
 * recap, mirroring getMonthRange's shape. Week label reads as a date range
 * ("Jul 27 - Aug 2") since "this week" alone would be ambiguous headline
 * text the way a month or year name isn't.
 */
export function getWeekRange(now: Date): { start: string; end: string; label: string } {
  const day = now.getUTCDay();
  // getUTCDay is 0(Sun)-6(Sat) -- convert to days-since-Monday so the week
  // always starts on Monday regardless of what day "now" falls on.
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday)
  );
  const nextMonday = new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 7)
  );
  const sunday = new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6)
  );
  const fmt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return {
    start: monday.toISOString(),
    end: nextMonday.toISOString(),
    label: `${fmt(monday)} - ${fmt(sunday)}`,
  };
}

/** A "hidden gem" needs an actual vote count to compare against, and a
 *  genuinely positive rating from the user — otherwise a title with no
 *  TMDB data at all would win by default, which isn't a real signal. */
const HIDDEN_GEM_MIN_SCORE = 4;

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function computeWrapped(
  rated: WrappedRatedTitle[],
  year: number,
  /** Text used in the summary line's "Your ___:" lead-in -- defaults to the
   *  plain year for the annual recap. The monthly recap (Premium perk, see
   *  getMyRecentWrapped) passes a month or week name instead ("Your July:") so the
   *  same scoring logic can back both without the summary text implying a
   *  full year's worth of data when it's really one month's. */
  summaryLabel: string = String(year)
): WrappedResult | null {
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

  const backdropPosterUrls = [...new Set(favoriteSorted.map((r) => r.posterUrl).filter((url): url is string => url != null))].slice(0, 8);

  const parts: string[] = [pluralize(totalRated, "film")];
  if (totalHours > 0) parts.push(`${pluralize(totalHours, "hour")} of screen time`);
  if (topArchetype) parts.push(`a strong ${topArchetype.name} streak`);
  else if (topGenres[0]) parts.push(`mostly ${topGenres[0].genre.toLowerCase()}`);
  const summary = `Your ${summaryLabel}: ${parts.join(", ")}.`;

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
    backdropPosterUrls,
  };
}
