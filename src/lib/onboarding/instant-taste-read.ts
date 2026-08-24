import { computeGenreAffinity, type RatedTitleForAffinity } from "@/lib/recommendations/genre-affinity";

/**
 * Instant taste read (magic-moments audit, task #757) -- the reveal
 * screen at the end of onboarding says something specific back about
 * what the person just told the app, computed straight from the swipe
 * session's own in-memory scores (see swipeHistoryRef in
 * onboarding-swipe.tsx). No DB round trip, no AI call: reuses
 * computeGenreAffinity, the exact same function driving the home
 * recommendation multiplier, so a genre named here is a genre the engine
 * will actually act on going forward -- never a generic "you seem to
 * like drama" that isn't backed by anything real.
 *
 * Deliberately doesn't attempt tone/mood descriptors ("morally messy
 * leads," etc.) the way the full Taste DNA archetype system does --
 * those need AI-tagged title metadata + a much larger sample than a
 * ~14-card onboarding deck can honestly support. Genre-only keeps every
 * word of this screen true to a session this small.
 */

const INSTANT_READ_AFFINITY_THRESHOLD = 0.2;
const MAX_GENRES_IN_READ = 2;

export function buildInstantTasteRead(swipeHistory: RatedTitleForAffinity[]): string | null {
  const affinity = computeGenreAffinity(swipeHistory);

  const topGenres = [...affinity.entries()]
    .filter(([, entry]) => entry.affinity >= INSTANT_READ_AFFINITY_THRESHOLD)
    .sort((a, b) => b[1].affinity - a[1].affinity)
    .slice(0, MAX_GENRES_IN_READ)
    .map(([genre]) => genre);

  if (topGenres.length === 0) return null;
  if (topGenres.length === 1) return `You gravitate toward ${topGenres[0]}`;
  return `You gravitate toward ${topGenres[0]} and ${topGenres[1]}`;
}
