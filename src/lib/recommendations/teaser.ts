/**
 * Pre-signup "taste teaser" — the landing page lets an anonymous visitor
 * swipe on a handful of movies before they've created an account, then
 * shows a few real recommendations built from just those swipes. There's
 * no taste vector yet (that requires an authenticated user + embeddings —
 * see engine.ts), so this is a much simpler, explainable genre-affinity
 * heuristic: strong enough to feel personalized after 6-8 swipes, cheap
 * enough to run with zero signal at all.
 *
 * Kept as pure functions (no DB access) so the actual scoring logic is
 * unit-testable — src/lib/actions/landing-teaser.ts is the thin
 * DB-fetching wrapper around this.
 */

export interface AnonSwipe {
  titleId: string;
  score: number; // 1 = not for me, 3 = it's fine, 5 = love it (see onboarding-swipe.tsx's RATING_FOR)
}

export interface SwipedTitleInfo {
  id: string;
  genres: string[];
}

export interface TeaserCandidate {
  id: string;
  genres: string[];
  weightedRating: number | null;
}

/**
 * Genre affinity: how much a genre should count toward "more like this"
 * (positive) or "less like this" (negative), derived from the swipes.
 * Centered on score=3 ("it's fine") being neutral, so a genre only present
 * in "it's fine" titles doesn't skew the teaser either way.
 */
export function buildGenreAffinity(swipes: AnonSwipe[], swipedTitles: SwipedTitleInfo[]): Map<string, number> {
  const titleById = new Map(swipedTitles.map((t) => [t.id, t]));
  const affinity = new Map<string, number>();

  for (const swipe of swipes) {
    const title = titleById.get(swipe.titleId);
    if (!title) continue;
    const weight = swipe.score - 3; // love_it=+2, its_fine=0, not_for_me=-2
    if (weight === 0) continue;
    for (const genre of title.genres) {
      affinity.set(genre, (affinity.get(genre) ?? 0) + weight);
    }
  }

  return affinity;
}

const QUALITY_FLOOR_MULTIPLIER = 0.5; // see quality-weighting.ts's own constants for the full-engine equivalent

/** Simple 0-1.5ish quality nudge so the teaser doesn't lead with an obscure
 *  unrated title just because it happens to match a liked genre — mirrors
 *  quality-weighting.ts's intent without importing it (different input
 *  shape here, and this module stays dependency-free on purpose). */
function teaserQualityMultiplier(weightedRating: number | null): number {
  if (weightedRating == null) return QUALITY_FLOOR_MULTIPLIER;
  return Math.max(QUALITY_FLOOR_MULTIPLIER, Math.min(1.3, weightedRating / 7.2));
}

export interface ScoredTeaserCandidate {
  id: string;
  score: number;
  matchedGenres: string[];
}

/** Scores + ranks candidates by genre affinity (weighted by quality),
 *  returning best-first. Candidates with no positive genre overlap at all
 *  are excluded rather than ranked last — a teaser with a random unrelated
 *  pick undermines the whole "it gets me" moment. */
export function rankTeaserCandidates(candidates: TeaserCandidate[], genreAffinity: Map<string, number>): ScoredTeaserCandidate[] {
  const scored = candidates.map((c) => {
    const matchedGenres = c.genres.filter((g) => (genreAffinity.get(g) ?? 0) > 0);
    const genreScore = c.genres.reduce((sum, g) => sum + (genreAffinity.get(g) ?? 0), 0);
    const score = genreScore * teaserQualityMultiplier(c.weightedRating);
    return { id: c.id, score, matchedGenres };
  });

  return scored.filter((s) => s.matchedGenres.length > 0 && s.score > 0).sort((a, b) => b.score - a.score);
}

/** Short, explainable "why" line for the teaser reveal — e.g. "Because you
 *  loved sci-fi and thrillers". Falls back to a generic line if somehow
 *  called with no matched genres (shouldn't happen given the filter in
 *  rankTeaserCandidates, but keeps this function safe standalone). */
export function buildTeaserWhy(matchedGenres: string[]): string {
  if (matchedGenres.length === 0) return "Because it's one of the best-reviewed picks in our catalogue";
  const top = matchedGenres.slice(0, 2);
  const joined = top.length === 2 ? `${top[0]} and ${top[1]}` : top[0];
  return `Because you loved ${joined.toLowerCase()}`;
}
