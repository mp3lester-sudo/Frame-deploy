import { tmdbUrl } from "@/lib/external/tmdb-client";
import { TRAILER_FETCH_TIMEOUT_MS } from "@/lib/external/fetch-timeout";

/**
 * Official trailer lookup, sourced live from TMDB (same "fetch per-request,
 * let Next.js's data cache handle reuse" pattern as tmdb-reviews.ts — no DB
 * storage needed since this is read-only reference content, not something
 * the rec engine or any other feature depends on).
 */

export interface TmdbTrailer {
  /** YouTube video id — pass straight into an embed URL. */
  key: string;
  name: string;
}

export async function getTmdbTrailer(tmdbId: number, type: "movie" | "tv"): Promise<TmdbTrailer | null> {
  try {
    const res = await fetch(tmdbUrl(`/${type}/${tmdbId}/videos`), {
      next: { revalidate: 86400 },
      // Longer than the shared EXTERNAL_FETCH_TIMEOUT_MS -- see
      // TRAILER_FETCH_TIMEOUT_MS in fetch-timeout.ts for why the trailer
      // lookup specifically gets more room.
      signal: AbortSignal.timeout(TRAILER_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results: Array<{
      key: string;
      name: string;
      site: string;
      type: string;
      official?: boolean;
    }> = data.results ?? [];

    const youtube = results.filter((v) => v.site === "YouTube");
    // Prefer an official trailer, then any trailer, then a teaser — official
    // trailers are the ones actually worth surfacing; teasers are a fallback
    // for titles (often older or niche) that never got a full trailer on
    // TMDB at all.
    const pick =
      youtube.find((v) => v.type === "Trailer" && v.official) ??
      youtube.find((v) => v.type === "Trailer") ??
      youtube.find((v) => v.type === "Teaser");

    return pick ? { key: pick.key, name: pick.name } : null;
  } catch {
    return null;
  }
}
