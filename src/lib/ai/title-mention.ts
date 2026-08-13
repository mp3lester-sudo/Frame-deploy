/**
 * Pure logic for "does this request already name a specific title, and if
 * so what should that constrain" -- extracted from concierge.ts so it's
 * unit-testable without the OpenAI/Supabase plumbing around it (same
 * split as taste-dna/archetypes.ts vs. compute.ts).
 *
 * Two concrete problems this solves:
 * 1. "movies like Memories of Murder" should never turn around and
 *    recommend Memories of Murder back. A semantic search over the
 *    request text routinely ranks the named title itself as one of the
 *    closest matches (it's often, almost by definition, extremely
 *    similar to a description of itself), so without this it's a common,
 *    easy way to get back the exact thing you already said you'd seen.
 * 2. "movies like <a movie from 2003>" recommending something from 2019
 *    misses the point of "like X" for someone anchoring on a specific
 *    era -- computeYearWindow narrows recommendations to within
 *    YEAR_WINDOW years of whatever's named, spanning every mentioned
 *    title's year if more than one is named. Opt-out, not forced: the
 *    caller decides whether to apply this at all (see the matchEra
 *    toggle in concierge.ts / the /ai page).
 */

// Titles shorter than this only get excluded on an exact whole-query
// match -- a lot of real one-word titles ("It", "Up", "Her", "Us") are
// also extremely common English words, so a raw substring match on them
// would misfire on totally unrelated requests ("I think it was scary"
// shouldn't exclude "It"). Longer titles are specific enough that a
// substring match is safe.
const MIN_TITLE_LENGTH_FOR_SUBSTRING_MATCH = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True if `query` names this title by name. Checks that the match isn't
 * immediately preceded or followed by a letter/digit (not JS's built-in
 * `\b` word boundary) so "Her" doesn't false-positive inside "gathered".
 * `\b` itself breaks for titles that start or end with punctuation --
 * e.g. a title ending in "(2021)" phrased at the very end of a sentence
 * -- since `\b` is only a real boundary when the *pattern's own* edge
 * character is itself a word character. Checking adjacency directly
 * sidesteps that regardless of what the title's own edges look like.
 * See MIN_TITLE_LENGTH_FOR_SUBSTRING_MATCH for the short-title case.
 */
export function queryMentionsTitle(query: string, name: string): boolean {
  const trimmedName = name.trim();
  if (!trimmedName) return false;
  if (trimmedName.length < MIN_TITLE_LENGTH_FOR_SUBSTRING_MATCH) {
    return query.trim().toLowerCase() === trimmedName.toLowerCase();
  }
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(trimmedName)}(?![A-Za-z0-9])`, "i");
  return pattern.test(query);
}

// How many years on either side of a named title's release year still
// count as the same era -- see computeYearWindow.
export const YEAR_WINDOW = 5;

export interface MentionedTitle {
  name: string;
  /** Release year, or null if the title's release_date is unknown --
   *  excluded from the window calculation rather than treated as 0. */
  releaseYear: number | null;
}

/** `titles.release_date` is `YYYY-MM-DD` (or null); pulls just the year,
 *  guarding against a null/malformed value rather than trusting it. */
export function releaseYearFromDate(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const year = Number(dateStr.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/**
 * Given the titles a query names (already confirmed via
 * queryMentionsTitle -- this function doesn't re-check that), returns the
 * release-year window recommendations should stay inside, or null if
 * nothing was named or none of what was named has a known release year
 * (nothing to anchor to). Spans every mentioned title's year, not just
 * one, so "something like Jaws and Alien" covers both eras rather than
 * arbitrarily picking whichever was named first.
 */
export function computeYearWindow(mentioned: MentionedTitle[]): { minYear: number; maxYear: number } | null {
  const years = mentioned.map((m) => m.releaseYear).filter((y): y is number => y !== null);
  if (!years.length) return null;
  return { minYear: Math.min(...years) - YEAR_WINDOW, maxYear: Math.max(...years) + YEAR_WINDOW };
}