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
