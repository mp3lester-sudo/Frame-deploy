/**
 * Decade/era-level affinity signal -- a soft nudge based on how a user's
 * own ratings skew across release decades. Fills a real gap: release_date
 * exists on every title but, before this, was read nowhere in the
 * recommendation pipeline (see recommendation-signal-and-problem-audit.md,
 * "decades" row) -- a user who's rated forty 1990s films and nothing since
 * got zero era-preference credit at all.
 *
 * Mirrors genre-affinity.ts's shape exactly (signed affinity per bucket,
 * confidence-scaled by sample size) but deliberately lighter-touch:
 * MAX_MULTIPLIER_SWING here is well under genre's, and MIN_OCCURRENCES asks
 * for more evidence before trusting a decade pattern at all. Decade is a
 * coincidence of when a film happened to release, not a chosen quality of
 * the film the way a genre is -- a real signal, but a much noisier one, so
 * "don't be too strict" means this should read as a light, tie-breaking-
 * scale nudge on top of content similarity, never something that could
 * meaningfully outrank a stronger taste match from a different era, and
 * never a filter -- nothing is ever excluded for being from an "off" decade.
 */

const RATING_MIDPOINT = 2.5; // out of 5 -- same convention as genre-affinity.ts
const RATING_SPAN = 2.5;

/** More evidence required than genre-affinity's MIN_OCCURRENCES (2) --
 *  decade is noisier, so a couple of data points shouldn't be enough to
 *  start nudging scores by it. */
const MIN_OCCURRENCES = 3;

/** Roughly a third of genre-affinity's ceiling (0.3) -- deliberately light. */
const MIN_MULTIPLIER_SWING = 0.03;
const MAX_MULTIPLIER_SWING = 0.12;
const FULL_CONFIDENCE_COUNT = 12;

/** A decade only gets named in a user-facing explanation once affinity
 *  clears this (stricter than the multiplier's own floor) bar -- a mild
 *  +0.05 lean isn't worth surfacing as "an era you love," but a consistent
 *  +0.3+ pattern is a real, sayable fact. */
const NOTE_AFFINITY_THRESHOLD = 0.3;

export interface RatedTitleForDecadeAffinity {
  score: number;
  releaseDate: string | null;
}

export interface DecadeAffinityEntry {
  /** Signed affinity in [-1, 1], same convention as genre-affinity.ts. */
  affinity: number;
  count: number;
}

/** Extracts a decade bucket (1990, 2000, 2010, ...) from a release_date
 *  string, or null if the date is missing/unparseable -- callers must
 *  treat null as "unknown," never as a neutral/zero decade. */
export function getDecade(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const year = new Date(releaseDate).getFullYear();
  if (!Number.isFinite(year) || year < 1870 || year > 2100) return null;
  return Math.floor(year / 10) * 10;
}

/** "1990s", "2000s", ... -- user-facing copy only. */
export function formatDecadeLabel(decade: number): string {
  return `${decade}s`;
}

/**
 * Signed affinity per decade. Decades with fewer than MIN_OCCURRENCES
 * ratings are omitted entirely (unknown, not neutral-zero), same rule
 * genre-affinity.ts uses.
 */
export function computeDecadeAffinity(ratings: RatedTitleForDecadeAffinity[]): Map<number, DecadeAffinityEntry> {
  const sums = new Map<number, number>();
  const counts = new Map<number, number>();

  for (const { score, releaseDate } of ratings) {
    const decade = getDecade(releaseDate);
    if (decade == null) continue;
    const signed = (score - RATING_MIDPOINT) / RATING_SPAN; // -1 (0.5*) .. +1 (5*)
    sums.set(decade, (sums.get(decade) ?? 0) + signed);
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }

  const affinity = new Map<number, DecadeAffinityEntry>();
  for (const [decade, count] of counts) {
    if (count < MIN_OCCURRENCES) continue;
    const avg = Math.max(-1, Math.min(1, (sums.get(decade) ?? 0) / count));
    affinity.set(decade, { affinity: avg, count });
  }
  return affinity;
}

/** No known decade (unparseable/missing release_date, or a decade with no
 *  evidenced affinity) returns 1 -- no opinion, no adjustment. */
export function decadeAffinityMultiplier(
  candidateReleaseDate: string | null | undefined,
  affinity: Map<number, DecadeAffinityEntry>
): number {
  const decade = getDecade(candidateReleaseDate);
  if (decade == null) return 1;
  const entry = affinity.get(decade);
  if (!entry) return 1;

  const confidence = Math.max(
    0,
    Math.min(1, (entry.count - MIN_OCCURRENCES) / (FULL_CONFIDENCE_COUNT - MIN_OCCURRENCES))
  );
  const swing = MIN_MULTIPLIER_SWING + (MAX_MULTIPLIER_SWING - MIN_MULTIPLIER_SWING) * confidence;
  return 1 + entry.affinity * swing;
}

/** A ready-to-use explanation fragment ("you tend to love films from the
 *  1990s") when this candidate's decade is a genuine, evidenced favorite --
 *  null otherwise (including for a negative or unevidenced decade -- this
 *  is additive-only copy, never used to explain away a weak match). */
export function decadeAffinityNote(
  candidateReleaseDate: string | null | undefined,
  affinity: Map<number, DecadeAffinityEntry>
): string | null {
  const decade = getDecade(candidateReleaseDate);
  if (decade == null) return null;
  const entry = affinity.get(decade);
  if (!entry || entry.affinity < NOTE_AFFINITY_THRESHOLD) return null;
  return `you tend to love films from the ${formatDecadeLabel(decade)}`;
}
