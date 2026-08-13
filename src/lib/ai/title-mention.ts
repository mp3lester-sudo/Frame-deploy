/**
 * Pure logic for "does this request already name a specific title" --
 * extracted from concierge.ts so it's unit-testable without the OpenAI/
 * Supabase plumbing around it (same split as taste-dna/archetypes.ts vs.
 * compute.ts).
 *
 * The concrete problem this solves: "movies like Memories of Murder"
 * should never turn around and recommend Memories of Murder back. A
 * semantic search over the request text routinely ranks the named title
 * itself as one of the closest matches (it's often, almost by
 * definition, extremely similar to a description of itself), so without
 * this it's a common, easy way to get back the exact thing you already
 * said you'd seen.
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
