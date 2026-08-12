/**
 * Diversity re-ranking. Before this, the final top-N recommendations were a
 * pure score-sort of the blended, context-adjusted candidate pool -- nothing
 * stopped five picks from being five near-duplicates of the same director's
 * work or the same tight subgenre cluster, since a taste vector naturally
 * scores everything close to a user's favorite film highly, including
 * several titles that are all close to EACH OTHER too.
 *
 * This is a greedy, similarity-aware re-rank: walk the already-sorted
 * candidate list, and for each open slot take the highest-scoring candidate
 * that isn't "too similar" to anything already selected. If every remaining
 * candidate is too similar to fill a slot (e.g. a user's taste is genuinely
 * narrow, or the pool is small), the threshold is dropped for that slot and
 * the next-best-scoring candidate is taken anyway -- this diversifies the
 * slate when there's room to, it never demotes a genuinely great match just
 * to hit a diversity quota, and it never returns fewer than `limit` results
 * when enough candidates exist.
 *
 * "Too similar" is genre overlap OR same director. Genre alone missed a
 * real, common case: five prestige dramas by five different directors clear
 * the genre bar fine as "diverse" by tag, but so does the far more visibly
 * repetitive case of three titles by the same director landing on a slate
 * together just because a taste vector naturally scores a filmmaker's whole
 * catalogue highly once it likes one of their films. Director data isn't on
 * `titles` itself (it lives in title_credits, see engine.ts's lookup), so
 * this is a plain optional id equality check rather than an embedding
 * comparison -- cheap, and unambiguous where genre-set overlap is fuzzy.
 */

/** Above this Jaccard overlap on genre sets, two titles are considered too
 *  similar to both appear in the same slate -- 0.5 means "at least half the
 *  combined genre set is shared" (e.g. two 2-genre titles sharing both
 *  genres, or a 2-genre and a 4-genre title sharing both of the smaller
 *  one's genres). Loose enough that genuinely adjacent-but-distinct titles
 *  (a Crime Drama next to a Crime Thriller) can still coexist. */
const MAX_GENRE_OVERLAP = 0.5;

export interface DiversifiableCandidate {
  id: string;
  score: number;
  genres: string[] | null;
  /** title_credits person_id for credit_type = 'director', or null/undefined
   *  if unknown -- unknown director never counts as a match against
   *  anything, same "no data means never similar" rule genres already use. */
  directorId?: string | null;
}

function genreJaccard(a: string[] | null, b: string[] | null): number {
  const setA = new Set(a ?? []);
  const setB = new Set(b ?? []);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const g of setA) if (setB.has(g)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function sameDirector(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a === b);
}

function tooSimilar(a: DiversifiableCandidate, b: DiversifiableCandidate): boolean {
  return genreJaccard(a.genres, b.genres) > MAX_GENRE_OVERLAP || sameDirector(a.directorId, b.directorId);
}

/**
 * Re-ranks an already score-sorted (descending) candidate list into a
 * diversified top-`limit` slate. Candidates with no genres (null/empty) or
 * no known director are never considered "similar" to anything on that
 * dimension, so they're always eligible on it.
 */
export function diversifyRecommendations<T extends DiversifiableCandidate>(
  sortedCandidates: T[],
  limit: number
): T[] {
  const selected: T[] = [];
  const remaining = [...sortedCandidates];

  while (selected.length < limit && remaining.length > 0) {
    let pickIndex = remaining.findIndex(
      (candidate) => !selected.some((s) => tooSimilar(s, candidate))
    );
    // Nothing left clears the bar -- relax it for this slot rather than
    // shrinking the slate below `limit`. `remaining` is still in score
    // order, so index 0 is the best available fallback.
    if (pickIndex === -1) pickIndex = 0;

    selected.push(remaining[pickIndex]);
    remaining.splice(pickIndex, 1);
  }

  return selected;
}
