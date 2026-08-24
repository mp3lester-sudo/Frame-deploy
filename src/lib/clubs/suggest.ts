import type { GenreAffinityEntry } from "@/lib/recommendations/genre-affinity";

/**
 * Suggested clubs based on genre affinity (personalization audit item
 * #6). Clubs have no genre field of their own (just name/description --
 * see migration 0013), so this infers a club's "vibe" from its creator's
 * own genre affinity, computed from their own ratings via the existing
 * computeGenreAffinity (genre-affinity.ts). ratings and titles are both
 * publicly readable (see migration 0002's RLS policies), unlike
 * taste_attributes (strictly private -- own-row-only), so this is the
 * cheapest signal actually available without a new migration or a
 * security-definer RPC: one bounded batch of ratings for however many
 * clubs' creators exist (capped by the clubs list itself, currently 100),
 * not a full per-club membership poll.
 */

/** How many of the viewer's own strongest genres to compare clubs
 *  against -- mirrors the "3 favorite genres" convention already used
 *  elsewhere (Ask Slate's tasteHint, DirectorOfTheDay's shortlist
 *  framing). */
export const TOP_GENRE_COUNT = 3;

/** Picks a person's strongest positive-affinity genres, highest first.
 *  Negative-affinity genres are never surfaced here -- "you both dislike
 *  the same thing" isn't a reason to suggest a club. */
export function topPositiveGenres(affinity: Map<string, GenreAffinityEntry>, count: number = TOP_GENRE_COUNT): string[] {
  return [...affinity.entries()]
    .filter(([, entry]) => entry.affinity > 0)
    .sort((a, b) => b[1].affinity - a[1].affinity)
    .slice(0, count)
    .map(([genre]) => genre);
}

export interface ClubGenreCandidate<T> {
  id: T;
  affinity: Map<string, GenreAffinityEntry>;
}

export interface SuggestedClub<T> {
  id: T;
  sharedGenres: string[];
}

/**
 * Ranks candidate clubs (the viewer isn't a member of) by how many of the
 * viewer's own top genres the club's creator also has a positive
 * affinity for. A club with zero overlap is dropped entirely rather than
 * padded in with a 0-genre "suggestion" -- no genre-affinity data is
 * different from "we checked and there's nothing in common."
 */
export function rankSuggestedClubs<T>(
  viewerTopGenres: string[],
  clubs: ClubGenreCandidate<T>[],
  limit: number
): SuggestedClub<T>[] {
  const scored = clubs.map((club) => {
    const sharedGenres = viewerTopGenres.filter((genre) => {
      const entry = club.affinity.get(genre);
      return entry !== undefined && entry.affinity > 0;
    });
    return { id: club.id, sharedGenres };
  });

  return scored
    .filter((c) => c.sharedGenres.length > 0)
    .sort((a, b) => b.sharedGenres.length - a.sharedGenres.length)
    .slice(0, limit);
}
