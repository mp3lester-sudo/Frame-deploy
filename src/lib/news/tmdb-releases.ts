import { tmdbUrl } from "@/lib/external/tmdb-client";
import { INDIE_DISTRIBUTOR_IDS } from "@/lib/news/indie-distributors";

/**
 * "Indie Spotlight" release calendar -- live TMDB /discover/movie call
 * filtered to known indie/specialty distributors (see
 * indie-distributors.ts), fetched per-request with a Next.js data cache
 * the same way lib/external/tmdb-reviews.ts already does for critic
 * reviews. No DB storage: this is a rolling window of what's new/upcoming,
 * not something that needs to survive as historical data.
 */
export interface IndieRelease {
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  posterUrl: string | null;
  overview: string;
  status: "new" | "upcoming";
}

interface TmdbDiscoverResult {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
}

/**
 * Pure mapper, split out from the fetch below so it's unit-testable
 * without hitting the network. `todayIso` is passed in (rather than read
 * from `new Date()` inside) purely so tests can pin "today" and assert
 * new-vs-upcoming classification deterministically.
 */
export function mapDiscoverResultsToReleases(
  results: TmdbDiscoverResult[],
  todayIso: string
): IndieRelease[] {
  return results
    .filter((r) => (r.title ?? r.name)?.trim())
    .map((r) => {
      const releaseDate = r.release_date || null;
      return {
        tmdbId: r.id,
        title: (r.title ?? r.name ?? "").trim(),
        releaseDate,
        // w342 is a fixed TMDB size segment, built directly rather than
        // routed through tmdbImageAtSize (which only knows about the
        // w185/h632/original sizes already stored for cast/person photos
        // elsewhere in the app).
        posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : null,
        overview: r.overview ?? "",
        status: (releaseDate && releaseDate <= todayIso ? "new" : "upcoming") as "new" | "upcoming",
      };
    })
    .sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""));
}

/** "Aug 12" style short date for a release-strip caption. */
export function formatReleaseDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export async function getIndieReleases(limit = 12): Promise<IndieRelease[]> {
  try {
    const today = new Date();
    const gte = new Date(today);
    gte.setUTCDate(gte.getUTCDate() - 30);
    const lte = new Date(today);
    lte.setUTCDate(lte.getUTCDate() + 120);

    const isoDate = (d: Date) => d.toISOString().slice(0, 10);

    const url = tmdbUrl("/discover/movie", {
      with_companies: INDIE_DISTRIBUTOR_IDS.join("|"),
      sort_by: "primary_release_date.asc",
      "primary_release_date.gte": isoDate(gte),
      "primary_release_date.lte": isoDate(lte),
      include_adult: "false",
      language: "en-US",
    });

    // 6h revalidate -- this is a shared, non-personalized fetch (same
    // result for every visitor), so a longer cache window than the 24h
    // used for critic reviews would be overkill in the other direction,
    // but new/upcoming release info doesn't change minute to minute either.
    const res = await fetch(url, { next: { revalidate: 21600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return mapDiscoverResultsToReleases(data.results ?? [], isoDate(today)).slice(0, limit);
  } catch {
    return [];
  }
}
