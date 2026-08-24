import "server-only";
import { computeGenreAffinity } from "@/lib/recommendations/genre-affinity";
import { createClient } from "@/lib/supabase/server";
import type { MediaType } from "@/lib/context/media-type-cookie";

/**
 * Auto-curated collections (magic-moments audit, task #756) -- "Your best
 * Horror picks," built entirely from data the recommendation engine
 * already computes: computeGenreAffinity (genre-affinity.ts, the same
 * function driving the home recommendation multiplier) picks which genres
 * this person actually has a real, evidenced preference for, and this
 * module just re-groups their own already-rated titles by those genres.
 *
 * Deliberately NOT the embedding-clustering approach flagged in the
 * original audit note as "the most expensive of the eight" -- no new
 * cron job, no new migration, no vector math beyond what genre-affinity.ts
 * already does. Everything here is a single ratings+titles query plus
 * in-memory grouping, cheap enough to compute on every Lists page view.
 */

const COLLECTION_AFFINITY_THRESHOLD = 0.25;
const MAX_COLLECTIONS = 3;
const MIN_SCORE_FOR_COLLECTION = 3.5;
const MAX_TITLES_PER_COLLECTION = 8;

export interface RatedTitleForCollections {
  id: string;
  name: string;
  posterUrl: string | null;
  score: number;
  genres: string[] | null;
  ratedAt: string;
}

export interface AutoCollection {
  genre: string;
  titles: RatedTitleForCollections[];
}

/**
 * Pure: groups the person's own highly-rated titles by whichever genres
 * computeGenreAffinity says they have a real (not fluke, not neutral)
 * preference for, strongest affinity first. Within a genre, titles are
 * ranked by score then recency -- the collection leads with what they
 * loved most, not just what they watched most recently.
 */
export function buildAutoCollections(ratings: RatedTitleForCollections[]): AutoCollection[] {
  const affinity = computeGenreAffinity(ratings.map((r) => ({ score: r.score, genres: r.genres })));

  const qualifyingGenres = [...affinity.entries()]
    .filter(([, entry]) => entry.affinity >= COLLECTION_AFFINITY_THRESHOLD)
    .sort((a, b) => b[1].affinity - a[1].affinity)
    .slice(0, MAX_COLLECTIONS)
    .map(([genre]) => genre);

  return qualifyingGenres
    .map((genre) => {
      const titles = ratings
        .filter((r) => r.score >= MIN_SCORE_FOR_COLLECTION && (r.genres ?? []).includes(genre))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime();
        })
        .slice(0, MAX_TITLES_PER_COLLECTION);
      return { genre, titles };
    })
    .filter((collection) => collection.titles.length >= 3); // not worth a shelf for 1-2 titles
}

export async function getAutoCollections(userId: string, mediaType: MediaType): Promise<AutoCollection[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("ratings")
    .select("score, rated_at, titles!inner(id, name, poster_url, genres, type)")
    .eq("user_id", userId)
    .eq("titles.type", mediaType);

  const ratings: RatedTitleForCollections[] = (rows ?? [])
    .map((r) => {
      const t = r.titles as unknown as { id: string; name: string; poster_url: string | null; genres: string[] | null };
      if (!t) return null;
      return {
        id: t.id,
        name: t.name,
        posterUrl: t.poster_url,
        score: r.score,
        genres: t.genres,
        ratedAt: r.rated_at,
      };
    })
    .filter((r): r is RatedTitleForCollections => r != null);

  return buildAutoCollections(ratings);
}
