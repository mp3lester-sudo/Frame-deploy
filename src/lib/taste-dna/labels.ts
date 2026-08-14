/**
 * Shared between /taste-dna (the standalone page) and the profile page's
 * embedded Marquee DNA panel, so the two surfaces can't drift out of sync
 * on what counts as "enough rating history" or how a pacing preference
 * reads back to the user.
 */

/** Below this many ratings, computeTasteDna's output is too thin to be
 *  worth showing -- both surfaces hide the DNA section entirely rather
 *  than displaying a mostly-empty one. */
export const MIN_SAMPLE_SIZE = 3;

export const PACING_LABEL: Record<string, string> = {
  slow: "You favor slow, deliberate pacing",
  moderate: "You favor a moderate, balanced pace",
  fast: "You favor fast, propulsive pacing",
};
