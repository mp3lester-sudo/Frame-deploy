"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getRecommendationsForUser } from "@/lib/recommendations/engine";
import { getActiveMediaType } from "@/lib/context/media-type";
import type { MediaType } from "@/lib/context/media-type-cookie";

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

  const mediaType = await getActiveMediaType();
  const { recommendations } = await getRecommendationsForUser(user.id, {
    limit: COMPLETION_PICK_COUNT,
    source: "onboarding",
    mediaType,
  });
  return recommendations.map((r) => ({ id: r.title.id, name: r.title.name, posterUrl: r.title.poster_url }));
}


/**
 * "Fully separate profiles" -- switching the Movies/Shows toggle into a
 * mode this account has never rated anything in should trigger the same
 * taste-check swipe flow a brand new signup gets (see /onboarding), not
 * silently drop them into an empty cold-start Discover feed. Called from
 * the toggle (media-type-toggle.tsx) right before it decides whether to
 * router.push("/onboarding") or just router.refresh().
 */
export async function hasAnyRatingsForType(mediaType: MediaType): Promise<boolean> {
  const user = await getVerifiedUser();
  if (!user) return true; // logged out -- toggle just refreshes, no redirect

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ratings")
    .select("title_id, titles!inner(type)")
    .eq("user_id", user.id)
    .eq("titles.type", mediaType)
    .limit(1);
  if (error) console.error("[onboarding] ratings lookup", error.message);

  return (data?.length ?? 0) > 0;
}
