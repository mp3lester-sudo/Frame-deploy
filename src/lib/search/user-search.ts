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
 * Builds the .or() filter string for matching a search query against either
 * a profile's username or display_name. Returns null for a query that's
 * empty after sanitizing (e.g. the user only typed commas/parens).
 */
export function buildUserSearchFilter(rawQuery: string): string | null {
  const query = sanitizeForOrFilter(rawQuery);
  if (!query) return null;
  return `username.ilike.%${query}%,display_name.ilike.%${query}%`;
}
