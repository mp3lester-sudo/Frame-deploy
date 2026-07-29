// Shared TMDB constants for server-side (non-ingestion-script) callers —
// person bios and reviews, both fetched lazily from the app itself rather
// than a batch script. TMDB_API_KEY is a server-only env var (no NEXT_PUBLIC_
// prefix), so these must only ever be called from Server Components, Route
// Handlers, or Server Actions.
export const TMDB_BASE = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function tmdbUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", process.env.TMDB_API_KEY ?? "");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Stored photo_url values (see scripts/ingest-tmdb.ts) are always built at
 * "w185" — plenty for a 56px cast-row thumbnail, but visibly soft when
 * stretched to fill a full profile-page portrait. TMDB serves the exact
 * same image at multiple sizes under the same path, so re-requesting a
 * bigger one is just swapping the size segment — no extra API call, no
 * extra DB column needed.
 */
export function tmdbImageAtSize(url: string | null, size: "w185" | "h632" | "original"): string | null {
  if (!url) return null;
  return url.replace(/\/t\/p\/w\d+\//, `/t/p/${size}/`);
}
