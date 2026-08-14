import { tmdbUrl } from "@/lib/external/tmdb-client";

/**
 * Critic/community reviews sourced from TMDB (distinct from Marquee's own
 * user review system). Fetched live per-request with a 24h Next.js data
 * cache — no DB storage needed since this is read-only reference content
 * that doesn't need to survive a schema change or feed the rec engine.
 */

export interface TmdbReview {
  id: string;
  author: string;
  avatarUrl: string | null;
  content: string;
  rating: number | null;
  createdAt: string;
  url: string;
}

export async function getTmdbReviews(tmdbId: number, type: "movie" | "tv"): Promise<TmdbReview[]> {
  try {
    const res = await fetch(tmdbUrl(`/${type}/${tmdbId}/reviews`), { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = await res.json();
    const results: Array<{
      id: string;
      author: string;
      author_details?: { rating?: number | null; avatar_path?: string | null };
      content: string;
      created_at: string;
      url: string;
    }> = data.results ?? [];

    return results.map((r) => {
      const avatarPath = r.author_details?.avatar_path ?? null;
      const avatarUrl = avatarPath
        ? avatarPath.startsWith("/https")
          ? avatarPath.slice(1) // TMDB sometimes stores a full gravatar URL prefixed with "/"
          : `https://image.tmdb.org/t/p/w64_and_h64_face${avatarPath}`
        : null;

      return {
        id: r.id,
        author: r.author,
        avatarUrl,
        content: r.content,
        rating: r.author_details?.rating ?? null,
        createdAt: r.created_at,
        url: r.url,
      };
    });
  } catch {
    return [];
  }
}
