/**
 * Adaptive onboarding deck — pure genre-bias selection.
 *
 * The onboarding swipe deck (see onboarding-swipe.tsx) used to be one
 * fixed, genre-diverse deck built once, server-side, before the first
 * swipe. Nothing about it adapted mid-session — an early run of Horror
 * loves didn't shift what got served for the back half of the same
 * onboarding pass. This module is the pure decision logic for the fix: at
 * a checkpoint partway through, look at the swipes so far and decide
 * which genres the rest of the deck should favor or avoid.
 *
 * Deliberately reuses computeGenreAffinity (genre-affinity.ts) rather
 * than a bespoke tally — same signed-affinity math the recommendation
 * engine itself trusts, applied to in-session swipes instead of rating
 * history. Ratings during onboarding use the same 1/3/5 scale as
 * elsewhere (RATING_FOR in onboarding-swipe.tsx), so the -1..+1 affinity
 * output means the same thing here it does everywhere else it's used.
 */

import { computeGenreAffinity, type GenreAffinityEntry } from "@/lib/recommendations/genre-affinity";
import { ANCHOR_GENRES } from "@/lib/catalogue/diverse-deck";

export interface SwipeSignal {
  score: number;
  genres: string[];
}

export interface AdaptiveGenreBias {
  favorGenres: string[];
  avoidGenres: string[];
}

// At most this many favored/avoided genres feed back into the deck query
// — enough to meaningfully bias the back half without narrowing it down
// to a single genre off a handful of early swipes.
export const ADAPTIVE_FAVOR_GENRE_COUNT = 3;
export const ADAPTIVE_AVOID_GENRE_COUNT = 2;

// Same "don't fake it" bar as the rest of this build order (see
// favorite-director-alerts.ts, suggest.ts): a genre only counts as
// favored/avoided once affinity clears a real threshold, not just
// "nudged positive by one swipe." computeGenreAffinity already requires
// >=2 occurrences before a genre gets an entry at all, so this is a
// second, stricter bar on top of that minimum-evidence floor.
const FAVOR_AFFINITY_THRESHOLD = 0.15;
const AVOID_AFFINITY_THRESHOLD = -0.15;

function topGenresByAffinity(
  affinity: Map<string, GenreAffinityEntry>,
  predicate: (entry: GenreAffinityEntry) => boolean,
  sortDescending: boolean,
  count: number
): string[] {
  const entries: { genre: string; entry: GenreAffinityEntry }[] = [];
  for (const genre of ANCHOR_GENRES) {
    const entry = affinity.get(genre);
    if (entry != null && predicate(entry)) entries.push({ genre, entry });
  }

  entries.sort((a, b) => (sortDescending ? b.entry.affinity - a.entry.affinity : a.entry.affinity - b.entry.affinity));

  return entries.slice(0, count).map((e) => e.genre);
}

/**
 * Genre-diverse swipe decks only ever draw from the fixed ANCHOR_GENRES
 * list, so signal is scoped to that same list — a swipe on a title with
 * some other genre tag doesn't produce a bias the deck builder couldn't
 * act on anyway.
 *
 * Empty swipes (or swipes with no clear lean either way) return empty
 * arrays on both sides — callers should treat that as "no adaptation
 * yet" and fall back to the plain diverse deck, not invent a bias.
 */
export function pickAdaptiveGenres(swipes: SwipeSignal[]): AdaptiveGenreBias {
  const affinity = computeGenreAffinity(swipes);

  const favorGenres = topGenresByAffinity(
    affinity,
    (e) => e.affinity >= FAVOR_AFFINITY_THRESHOLD,
    true,
    ADAPTIVE_FAVOR_GENRE_COUNT
  );
  const avoidGenres = topGenresByAffinity(
    affinity,
    (e) => e.affinity <= AVOID_AFFINITY_THRESHOLD,
    false,
    ADAPTIVE_AVOID_GENRE_COUNT
  );

  return { favorGenres, avoidGenres };
}
