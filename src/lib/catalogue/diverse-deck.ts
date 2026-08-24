import type { createClient } from "@/lib/supabase/server";
import type { MediaType } from "@/lib/context/media-type-cookie";
import { getTmdbTrailer } from "@/lib/external/tmdb-videos";

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
  tmdbId: number | null;
  type: "movie" | "tv";
}

// How many candidates to pull per genre before falling back to the next
// one — covers the "same title tops two genres" case, the "caller's
// excludeIds ate the top pick" case, AND (now that decks can ask for more
// than one title per genre) supplying a genuine 2nd/3rd-best pick for the
// round-robin pass below, all without a second round-trip per genre.
const CANDIDATES_PER_GENRE = 8;

export async function buildDiverseDeck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  {
    limit = ANCHOR_GENRES.length,
    excludeIds = [] as string[],
    mediaType,
    genres = ANCHOR_GENRES as readonly string[],
    avoidGenres = [] as string[],
  }: {
    limit?: number;
    excludeIds?: string[];
    mediaType: MediaType;
    /** Which anchor genres to round-robin through — defaults to the full
     *  14-genre list. The adaptive onboarding batch (see
     *  src/lib/catalogue/adaptive-onboarding.ts) narrows this to a user's
     *  own early-favored genres instead of the fixed default set. */
    genres?: readonly string[];
    /** Genres to exclude candidates for entirely (Postgres array-overlap,
     *  not per-genre-pool) — the adaptive batch's negative-signal half.
     *  Left empty by every caller except the adaptive batch. */
    avoidGenres?: string[];
  }
): Promise<DeckTitle[]> {
  const excluded = new Set(excludeIds);

  // Fetch each requested genre's candidate pool once regardless of `limit`
  // — the round-robin below decides how many of each pool actually get
  // used.
  const results = await Promise.all(
    genres.map((genre) => {
      let query = supabase
        .from("titles")
        .select("id, name, overview, poster_url, release_date, runtime_minutes, genres, tmdb_id, type")
        .eq("type", mediaType)
        .contains("genres", [genre])
        .not("poster_url", "is", null)
        .order("weighted_rating", { ascending: false, nullsFirst: false })
        .limit(CANDIDATES_PER_GENRE);
      if (excludeIds.length) query = query.not("id", "in", `(${excludeIds.join(",")})`);
      // .not(col, "ov", value) doesn't auto-format arrays the way
      // .overlaps() does (verified against the actual query string it
      // produces) — build the Postgrest array-literal string by hand so
      // "not overlapping any avoided genre" round-trips correctly.
      if (avoidGenres.length) query = query.not("genres", "ov", `{${avoidGenres.join(",")}}`);
      return query;
    })
  );

  const pools = genres.map((genre, i) => ({
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
        tmdbId: pick.tmdb_id,
        type: pick.type,
      });
      madeProgressThisLap = true;
    }
  }
  return deck;
}


export interface EnrichedDeckTitle {
  id: string;
  name: string;
  overview: string | null;
  posterUrl: string | null;
  year: string | null;
  director: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  trailerKey: string | null;
}

/**
 * Shared director+trailer enrichment for a deck of titles — extracted
 * from onboarding/page.tsx so the adaptive mid-session batch (fetched via
 * a server action, not a page render) can produce cards in exactly the
 * same shape without duplicating this logic. Structurally identical to
 * onboarding-swipe.tsx's SwipeTitle; kept as a local interface here
 * rather than importing that type from a client component.
 */
export async function enrichDeckTitles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deck: DeckTitle[]
): Promise<EnrichedDeckTitle[]> {
  if (!deck.length) return [];

  const titleIds = deck.map((t) => t.id);
  const { data: directorCredits } = await supabase
    .from("title_credits")
    .select("title_id, people(name)")
    .eq("credit_type", "director")
    .in("title_id", titleIds);

  const directorByTitle = new Map<string, string>();
  for (const c of directorCredits ?? []) {
    const name = (c as unknown as { people: { name: string } | null }).people?.name;
    if (name && !directorByTitle.has(c.title_id)) directorByTitle.set(c.title_id, name);
  }

  // Fetched in parallel and cached 24h server-side (see getTmdbTrailer) --
  // cheap even for a full deck, since it only pulls the YouTube video id
  // per title, not the video itself.
  const trailers = await Promise.all(
    deck.map((t) => (t.tmdbId ? getTmdbTrailer(t.tmdbId, t.type) : Promise.resolve(null)))
  );

  return deck.map((t, i) => ({
    id: t.id,
    name: t.name,
    overview: t.overview,
    posterUrl: t.posterUrl,
    year: t.year,
    director: directorByTitle.get(t.id) ?? null,
    runtimeMinutes: t.runtimeMinutes,
    genres: t.genres,
    trailerKey: trailers[i]?.key ?? null,
  }));
}
