import { tokenizeSearchQuery } from "@/lib/search/tokenize";

// Pure helpers for the people-search filter, kept separate from
// src/lib/actions/users.ts (a "use server" file, which may only export async
// functions) so this logic is directly unit-testable.

/**
 * PostgREST's .or() filter syntax splits top-level conditions on commas and
 * uses parens for grouping. A raw user query containing either would corrupt
 * the filter string (or, worse, let someone smuggle in an unintended
 * condition), so strip them before building the filter.
 */
export function sanitizeForOrFilter(query: string): string {
  return query.replace(/[,()]/g, " ").trim();
}

/**
 * Builds the .or() filter string for matching a search query against a
 * profile's username or display_name. A single-word query matches either
 * field directly. A multi-word query (e.g. "michael lester") requires every
 * word to appear *somewhere* across the two fields -- not the whole phrase
 * verbatim in one field -- so "Lester Michael", "Michael J Lester", or a
 * first/last name split across username vs. display_name all still match,
 * instead of only the one exact typed order/spacing.
 */
export function buildUserSearchFilter(rawQuery: string): string | null {
  const words = tokenizeSearchQuery(sanitizeForOrFilter(rawQuery));
  if (words.length === 0) return null;

  if (words.length === 1) {
    const word = words[0];
    return `username.ilike.%${word}%,display_name.ilike.%${word}%`;
  }

  const wordGroups = words.map((word) => `or(username.ilike.%${word}%,display_name.ilike.%${word}%)`);
  return `and(${wordGroups.join(",")})`;
}
