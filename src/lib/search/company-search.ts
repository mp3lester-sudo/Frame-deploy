/**
 * Recognizes a search-bar query as a production/distribution studio
 * rather than a literal title name, mapped to that studio's TMDB
 * "company" id -- lets titles search answer "A24" (or "Pixar", "Warner
 * Bros", etc.) with that studio's actual catalogue via a live TMDB
 * /discover/movie call (see getTitleIdsForCompany in company-titles.ts),
 * instead of only ever matching against title names in our own DB.
 *
 * Every id below was verified by requesting
 * themoviedb.org/company/<id> directly and confirming TMDB's own
 * redirect resolves it to that studio's slug (e.g. id 174 redirects to
 * .../174-warner-bros-pictures) -- none of these were guessed.
 *
 * Indie-leaning labels here intentionally match indie-distributors.ts
 * (same ids, kept in a separate small map there since that file is about
 * curating the home page's Indie Spotlight, not query recognition).
 */
const KNOWN_COMPANIES: Record<string, { id: number; name: string }> = {
  a24: { id: 41077, name: "A24" },
  neon: { id: 90733, name: "NEON" },
  magnolia: { id: 1030, name: "Magnolia Pictures" },
  "magnolia pictures": { id: 1030, name: "Magnolia Pictures" },
  searchlight: { id: 127929, name: "Searchlight Pictures" },
  "searchlight pictures": { id: 127929, name: "Searchlight Pictures" },
  "fox searchlight": { id: 43, name: "Fox Searchlight Pictures" },
  "fox searchlight pictures": { id: 43, name: "Fox Searchlight Pictures" },

  "warner bros": { id: 174, name: "Warner Bros. Pictures" },
  "warner bros.": { id: 174, name: "Warner Bros. Pictures" },
  "warner brothers": { id: 174, name: "Warner Bros. Pictures" },
  "warner bros pictures": { id: 174, name: "Warner Bros. Pictures" },

  universal: { id: 33, name: "Universal Pictures" },
  "universal pictures": { id: 33, name: "Universal Pictures" },

  disney: { id: 2, name: "Walt Disney Pictures" },
  "walt disney pictures": { id: 2, name: "Walt Disney Pictures" },
  "walt disney": { id: 2, name: "Walt Disney Pictures" },

  paramount: { id: 4, name: "Paramount Pictures" },
  "paramount pictures": { id: 4, name: "Paramount Pictures" },

  columbia: { id: 5, name: "Columbia Pictures" },
  "columbia pictures": { id: 5, name: "Columbia Pictures" },
  sony: { id: 5, name: "Columbia Pictures" },
  "sony pictures": { id: 5, name: "Columbia Pictures" },

  lionsgate: { id: 1632, name: "Lionsgate" },

  marvel: { id: 420, name: "Marvel Studios" },
  "marvel studios": { id: 420, name: "Marvel Studios" },

  pixar: { id: 3, name: "Pixar" },

  dreamworks: { id: 521, name: "DreamWorks Animation" },
  "dreamworks animation": { id: 521, name: "DreamWorks Animation" },

  "20th century": { id: 127928, name: "20th Century Studios" },
  "20th century studios": { id: 127928, name: "20th Century Studios" },
  "20th century fox": { id: 127928, name: "20th Century Studios" },
};

export interface CompanyMatch {
  id: number;
  name: string;
}

/** Exact-match only (after trim/lowercase) -- deliberately not a fuzzy or
 * substring match, since a false positive here would silently replace a
 * real title-name search with an unrelated studio's catalogue. */
export function findCompanyMatch(rawQuery: string): CompanyMatch | null {
  const key = rawQuery.trim().toLowerCase();
  if (!key) return null;
  return KNOWN_COMPANIES[key] ?? null;
}
