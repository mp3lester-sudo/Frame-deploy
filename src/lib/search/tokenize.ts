/**
 * Splits a raw search query into individual word tokens for "match every
 * word, anywhere, in any order" search -- replacing a single whole-phrase
 * ilike (which requires the exact typed text to appear contiguously and in
 * that exact order) so word order, extra context words, and names split
 * across multiple fields (e.g. first name in one column, last name in
 * another) don't cause an otherwise-correct query to come back empty.
 */
export function tokenizeSearchQuery(raw: string): string[] {
  return raw.trim().split(/\s+/).filter(Boolean);
}
