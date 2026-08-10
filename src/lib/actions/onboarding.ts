"use server";

import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getRecommendationsForUser } from "@/lib/recommendations/engine";

/**
 * Completion-reveal picks for the post-signup /onboarding quiz — real
 * recommendations from the actual engine (not the landing teaser's
 * genre-heuristic approximation), since by this point the user is
 * authenticated and has a real taste vector seeded from the ratings they
 * just gave. Falls back gracefully to the engine's own cold-start
 * popularity picks if they skipped without rating anything.
 */
export interface OnboardingCompletionPick {
  id: string;
  name: string;
  posterUrl: string | null;
}

const COMPLETION_PICK_COUNT = 3;

export async function getOnboardingCompletionPicks(): Promise<OnboardingCompletionPick[]> {
  const user = await getVerifiedUser();
  if (!user) return [];

  const { recommendations } = await getRecommendationsForUser(user.id, { limit: COMPLETION_PICK_COUNT, source: "onboarding" });
  return recommendations.map((r) => ({ id: r.title.id, name: r.title.name, posterUrl: r.title.poster_url }));
}
