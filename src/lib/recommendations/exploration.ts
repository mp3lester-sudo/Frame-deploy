/**
 * Recommendation intelligence audit finding #2: the engine was pure
 * exploitation -- every slot always went to the single highest-scoring
 * candidate, so a user's slate never surfaced anything meaningfully
 * outside what their taste vector already confidently predicted. A well-
 * personalized engine also explores: it occasionally tries something
 * adjacent to, but genuinely distinct from, a user's dominant pattern,
 * and is honest about that instead of dressing it up as another top
 * match (see buildExplorationDetail in explain.ts for the labeling side
 * of this).
 *
 * This picks ONE candidate for that role from the same already-scored,
 * already-quality-floor-passed pool everything else on the slate comes
 * from (see engine.ts) -- exploration is not an excuse to recommend
 * something bad, unrelated, or unvetted, just something in a genre this
 * user's own ratings barely touch.
 */

export interface ExplorationCandidate {
  id: string;
  score: number;
  genres: string[] | null;
}

/** A genre counts as part of this user's "usual" pattern once it accounts
 *  for at least this share of their rated titles' genre tags. Below this,
 *  a candidate's genres are unfamiliar enough to be a genuine widen-the-
 *  net pick rather than just another entry in an already-dominant genre.
 *  15% is deliberately loose -- a user who's rated 40 dramas and 3
 *  comedies still has comedy as "explored," just not dominant, so 3/43
 *  (~7%) would correctly stay eligible for an exploration pick, while a
 *  genre at 20%+ of their history clearly isn't unfamiliar territory. */
const DOMINANT_GENRE_SHARE_THRESHOLD = 0.15;

/**
 * Builds the set of genres that are already part of this user's proven
 * taste, from the same rated-title genre lists genre-affinity.ts uses.
 * Returns an empty set for a user with no rated-genre data at all (too new
 * to have a "usual" pattern yet, so nothing can be confirmed as different
 * from it) -- callers should treat an empty set as "no exploration pick
 * possible" rather than "everything is exploration."
 */
export function computeDominantGenres(ratedGenreLists: (string[] | null)[]): Set<string> {
  const counts = new Map<string, number>();
  let total = 0;
  for (const genres of ratedGenreLists) {
    for (const g of genres ?? []) {
      counts.set(g, (counts.get(g) ?? 0) + 1);
      total++;
    }
  }
  const dominant = new Set<string>();
  if (total === 0) return dominant;
  for (const [genre, count] of counts) {
    if (count / total >= DOMINANT_GENRE_SHARE_THRESHOLD) dominant.add(genre);
  }
  return dominant;
}

/**
 * Picks the best-scoring candidate whose genres share NONE of the user's
 * dominant genres -- a genuinely different pick, not just a slightly-
 * lower-scoring version of the same thing. Candidates with no genre data
 * are skipped (can't confirm they're actually different from anything).
 * `excludeIds` keeps this from re-selecting something already on the main
 * slate. Returns null when nothing in the pool qualifies -- a brand-new
 * user with no dominant genres yet, or a pool that's genuinely
 * homogeneous -- callers should fall back to the normal exploit slate in
 * that case rather than forcing a weak or fabricated "different" pick.
 */
export function pickExplorationCandidate(
  candidates: ExplorationCandidate[],
  dominantGenres: Set<string>,
  excludeIds: Set<string>
): ExplorationCandidate | null {
  if (dominantGenres.size === 0) return null;

  let best: ExplorationCandidate | null = null;
  for (const candidate of candidates) {
    if (excludeIds.has(candidate.id)) continue;
    const genres = candidate.genres ?? [];
    if (genres.length === 0) continue;
    const overlapsUsualTaste = genres.some((g) => dominantGenres.has(g));
    if (overlapsUsualTaste) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}
