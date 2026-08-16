import { tmdbUrl } from "@/lib/external/tmdb-client";

/**
 * Live TMDB ids for a studio's catalogue, ordered by popularity --
 * paired with a local `titles.tmdb_id IN (...)` lookup in
 * src/app/search/page.tsx to render only films that already exist in
 * Slate's own catalogue (so results use our real DB rows -- ratings,
 * poster_url, everything TitleCard expects -- not a second, inconsistent
 * data source). Titles TMDB knows about that we haven't ingested simply
 * don't show up; that's an acceptable gap rather than a reason to block
 * this on a new ingestion pass.
 */
export async function getTmdbIdsForCompany(companyId: number, limit = 40): Promise<number[]> {
  try {
    const ids: number[] = [];
    // TMDB returns 20 results per page -- two pages covers the default
    // limit without over-fetching for a feature that's about recognizing
    // a studio query, not replacing Discover's full browse experience.
    for (let page = 1; page <= Math.ceil(limit / 20) && ids.length < limit; page++) {
      const url = tmdbUrl("/discover/movie", {
        with_companies: String(companyId),
        sort_by: "popularity.desc",
        include_adult: "false",
        language: "en-US",
        page: String(page),
      });
      const res = await fetch(url, { next: { revalidate: 21600 } });
      if (!res.ok) break;
      const data = await res.json();
      const results: Array<{ id: number }> = data.results ?? [];
      if (results.length === 0) break;
      ids.push(...results.map((r) => r.id));
    }
    return ids.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Re-orders local DB rows (keyed by tmdb_id, arbitrary order from a
 * Supabase `.in()` query) to match a reference list of tmdb ids --
 * pure/testable separately from the two fetches above.
 */
export function orderByTmdbIdSequence<T extends { tmdb_id: number | null }>(
  rows: T[],
  orderedTmdbIds: number[]
): T[] {
  const rank = new Map(orderedTmdbIds.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => {
    const ra = a.tmdb_id != null ? rank.get(a.tmdb_id) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    const rb = b.tmdb_id != null ? rank.get(b.tmdb_id) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    return ra - rb;
  });
}
