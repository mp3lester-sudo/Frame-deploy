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
 * first N — onboarding uses all 14. A caller wanting MORE than 14 (the
 * landing teaser now asks for up to 20, to get a genuinely confident read
 * on taste before the reveal) gets a second round-robin pass through the
 * same genre order, picking each genre's next-best title, rather than
 * capping out at one-per-genre — see the round-robin loop below.
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
// one — covers the "same title tops two genres" case, the "caller's
// excludeIds ate the top pick" case, AND (now that decks can ask for more
// than one title per genre) supplying a genuine 2nd/3rd-best pick for the
// round-robin pass below, all without a second round-trip per genre.
const CANDIDATES_PER_GENRE = 8;

export async function buildDiverseDeck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  { limit = ANCHOR_GENRES.length, excludeIds = [] as string[] }: { limit?: number; excludeIds?: string[] } = {}
): Promise<DeckTitle[]> {
  const excluded = new Set(excludeIds);

  // Fetch each anchor genre's candidate pool once regardless of `limit` —
  // the round-robin below decides how many of each pool actually get used.
  const results = await Promise.all(
    ANCHOR_GENRES.map((genre) => {
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

  const pools = ANCHOR_GENRES.map((genre, i) => ({
    genre,
    candidates: (results[i].data ?? []).filter((t) => !excluded.has(t.id)),
    cursor: 0,
  }));

  // Round-robin through every anchor genre, taking each one's next-best
  // unused title per lap, until `limit` titles are collected or every pool
  // runs dry. A `limit` of 14 or fewer never needs a second lap (one pick
  // per genre, same behavior as before); a `limit` of 20 naturally spills
  // into a 2nd-best pick for the first ~6 genres in frequency order, which
  // keeps the deck genre-diverse instead of just deeper into one genre.
  const seen = new Set<string>();
  const deck: DeckTitle[] = [];
  let madeProgressThisLap = true;
  while (deck.length < limit && madeProgressThisLap) {
    madeProgressThisLap = false;
    for (const pool of pools) {
      if (deck.length >= limit) break;
      while (pool.cursor < pool.candidates.length && seen.has(pool.candidates[pool.cursor].id)) {
        pool.cursor++;
      }
      if (pool.cursor >= pool.candidates.length) continue; // this genre's pool is exhausted — skip it, not an error
      const pick = pool.candidates[pool.cursor];
      pool.cursor++;
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
      madeProgressThisLap = true;
    }
  }
  return deck;
}
