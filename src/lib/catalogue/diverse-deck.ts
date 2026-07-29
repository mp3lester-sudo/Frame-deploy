import type { createClient } from "@/lib/supabase/server";

/**
 * Shared genre-diverse swipe deck builder — used by both the pre-signup
 * landing teaser (src/lib/actions/landing-teaser.ts) and the post-signup
 * /onboarding quiz. One strong title per anchor genre rather than raw
 * popularity: a deck of all-the-same-genre blockbusters doesn't generate
 * enough genre spread for downstream taste-affinity scoring to say
 * anything meaningful after only a handful of swipes.
 *
 * Ordered roughly by real catalogue genre frequency (see the genre audit
 * behind this list) so a caller wanting a shorter deck can just slice the
 * first N — the landing teaser uses the first 10, onboarding uses all 14.
 */
export const ANCHOR_GENRES = [
  "Drama",
  "Comedy",
  "Action",
  "Thriller",
  "Horror",
  "Romance",
  "Science Fiction",
  "Fantasy",
  "Animation",
  "Crime",
  "Adventure",
  "Mystery",
  "Family",
  "History",
] as const;

export interface DeckTitle {
  id: string;
  name: string;
  overview: string | null;
  posterUrl: string | null;
  year: string | null;
  runtimeMinutes: number | null;
  genres: string[];
}

// How many candidates to pull per genre before falling back to the next
// one — covers both the "same title tops two genres" case and the
// "caller's excludeIds ate the top pick" case, without needing a second
// round-trip per genre.
const CANDIDATES_PER_GENRE = 5;

export async function buildDiverseDeck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  { limit = ANCHOR_GENRES.length, excludeIds = [] as string[] }: { limit?: number; excludeIds?: string[] } = {}
): Promise<DeckTitle[]> {
  const genres = ANCHOR_GENRES.slice(0, limit);
  const excluded = new Set(excludeIds);

  const results = await Promise.all(
    genres.map((genre) => {
      let query = supabase
        .from("titles")
        .select("id, name, overview, poster_url, release_date, runtime_minutes, genres")
        .contains("genres", [genre])
        .not("poster_url", "is", null)
        .order("weighted_rating", { ascending: false, nullsFirst: false })
        .limit(CANDIDATES_PER_GENRE);
      if (excludeIds.length) query = query.not("id", "in", `(${excludeIds.join(",")})`);
      return query;
    })
  );

  const seen = new Set<string>();
  const deck: DeckTitle[] = [];
  for (const { data: candidates } of results) {
    const pick = (candidates ?? []).find((t) => !seen.has(t.id) && !excluded.has(t.id));
    if (!pick) continue; // every candidate for this genre was a dup or excluded — skip this slot rather than error
    seen.add(pick.id);
    deck.push({
      id: pick.id,
      name: pick.name,
      overview: pick.overview,
      posterUrl: pick.poster_url,
      year: pick.release_date?.slice(0, 4) ?? null,
      runtimeMinutes: pick.runtime_minutes,
      genres: pick.genres ?? [],
    });
  }
  return deck;
}
