"use server";

import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getRecommendationsForUser } from "@/lib/recommendations/engine";

/** Client-safe shape -- title.poster_url/backdrop_url/name/genres/release_date
 *  are the only fields SwipeRecsCard actually renders, so this trims the
 *  full Title row (30+ columns, including taste-signal fields with no
 *  business being serialized to the client) down to what's displayed. */
export interface SwipeRec {
  id: string;
  name: string;
  releaseYear: number | null;
  genres: string[];
  posterUrl: string | null;
  backdropUrl: string | null;
  reason: string;
  matchPercent: number | null;
}

const SWIPE_DECK_SIZE = 12;

/**
 * Backs the swipe-to-decide deck (Discover, SwipeRecsCard) -- same engine
 * as every other recommendation surface, just a bigger batch (12 instead
 * of the usual 5) and its own `source` tag on recommendation_impressions
 * so this surface's impressions don't get mixed into home/onboarding's
 * numbers.
 */
export async function getSwipeDeck(): Promise<SwipeRec[]> {
  const user = await getVerifiedUser();
  if (!user) return [];

  const { recommendations } = await getRecommendationsForUser(user.id, {
    limit: SWIPE_DECK_SIZE,
    source: "swipe_deck",
  });

  return recommendations.map((r) => ({
    id: r.title.id,
    name: r.title.name,
    releaseYear: r.title.release_date ? new Date(r.title.release_date).getFullYear() : null,
    genres: r.title.genres ?? [],
    posterUrl: r.title.poster_url,
    backdropUrl: r.title.backdrop_url,
    reason: r.reason,
    matchPercent: r.matchPercent,
  }));
}
