import { createServiceRoleClient } from "@/lib/supabase/server";
import { EXTERNAL_FETCH_TIMEOUT_MS } from "@/lib/external/fetch-timeout";

/**
 * Rotten Tomatoes has no public API. The standard workaround is OMDb, which
 * surfaces a Tomatometer (critic) score for movies only — no TV coverage,
 * no audience score. See src/lib/external/README.md.
 *
 * Because OMDb's free tier caps at 1,000 requests/day and the catalogue has
 * ~36k titles, scores are fetched lazily on movie page view rather than
 * bulk-backfilled: the first person to view a given movie page triggers the
 * lookup, the result (or the fact that there was no match) is cached in
 * titles.rt_critic_score / rt_checked_at, and every subsequent view is a
 * free DB read.
 */

export interface RtLookupInput {
  id: string;
  type: "movie" | "tv";
  name: string;
  release_date: string | null;
  rt_critic_score: number | null;
  rt_checked_at: string | null;
}

export async function getOrFetchRtCriticScore(title: RtLookupInput): Promise<number | null> {
  // OMDb has no TV Tomatometer coverage — don't bother looking up.
  if (title.type !== "movie") return null;

  // Already checked (hit or confirmed miss) — serve from cache.
  if (title.rt_checked_at) return title.rt_critic_score;

  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) return null; // not configured yet; leave uncached so it retries once it is

  const year = title.release_date?.slice(0, 4);
  const params = new URLSearchParams({ apikey: apiKey, t: title.name });
  if (year) params.set("y", year);

  let rtScore: number | null = null;
  let imdbId: string | null = null;

  try {
    const res = await fetch(`https://www.omdbapi.com/?${params.toString()}`, {
      // RT scores barely change once released; a day's staleness is fine
      // and this keeps us well under the free-tier daily cap on re-renders.
      next: { revalidate: 86400 },
      // OMDb has no SLA -- a stalled request here used to block the whole
      // movie page behind it. Times out into the "network hiccup" catch
      // below (no cache write, retried on the title's next view) instead
      // of making a real visitor wait an unbounded amount of time.
      signal: AbortSignal.timeout(EXTERNAL_FETCH_TIMEOUT_MS),
    });
    const data = await res.json();

    if (data?.Response === "True") {
      imdbId = data.imdbID ?? null;
      const ratings: { Source: string; Value: string }[] = data.Ratings ?? [];
      const rt = ratings.find((r) => r.Source === "Rotten Tomatoes");
      if (rt) {
        const parsed = parseInt(rt.Value.replace("%", ""), 10);
        if (!Number.isNaN(parsed)) rtScore = parsed;
      }
    }
  } catch {
    // Network/API hiccup — don't cache a miss, just try again next view.
    return null;
  }

  const supabase = createServiceRoleClient();
  await supabase
    .from("titles")
    .update({
      rt_critic_score: rtScore,
      imdb_id: imdbId,
      rt_checked_at: new Date().toISOString(),
    })
    .eq("id", title.id);

  return rtScore;
}
