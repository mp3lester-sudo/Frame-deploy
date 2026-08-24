"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getRecommendationsForUser } from "@/lib/recommendations/engine";
import { getActiveMediaType } from "@/lib/context/media-type";
import type { MediaType } from "@/lib/context/media-type-cookie";
import { buildDiverseDeck, enrichDeckTitles, ANCHOR_GENRES, type EnrichedDeckTitle } from "@/lib/catalogue/diverse-deck";
import { pickAdaptiveGenres, type SwipeSignal } from "@/lib/catalogue/adaptive-onboarding";

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


/**
 * Adaptive onboarding deck (personalization audit #7) — the mid-session
 * branch point. onboarding-swipe.tsx calls this once, at a checkpoint
 * partway through the original fixed deck, passing every swipe made so
 * far. The genre bias derived from those swipes (see
 * pickAdaptiveGenres) replaces the untouched remainder of the deck with
 * a batch that favors genres the user has already shown a real lean
 * toward and avoids ones they've already passed on repeatedly — same
 * buildDiverseDeck round-robin machinery the fixed deck itself uses,
 * just pointed at a narrower, personal genre list instead of the fixed
 * 14-anchor default.
 *
 * Cold-start-safe by construction: pickAdaptiveGenres returns an empty
 * favorGenres list until real signal clears its evidence threshold, and
 * buildDiverseDeck falls back to the full ANCHOR_GENRES list whenever
 * `genres` comes back empty — so a checkpoint with no clear lean yet
 * just continues serving the plain diverse deck, never a fabricated
 * bias. avoidGenres can still apply on its own even without a favor
 * signal (a few decisive "not for me" swipes are as real a signal as a
 * few "love it" swipes).
 */
export async function getAdaptiveOnboardingBatch(
  swipes: SwipeSignal[],
  excludeIds: string[],
  limit: number
): Promise<EnrichedDeckTitle[]> {
  const user = await getVerifiedUser();
  if (!user || limit <= 0) return [];

  const supabase = await createClient();
  const mediaType = await getActiveMediaType();
  const { favorGenres, avoidGenres } = pickAdaptiveGenres(swipes);

  const deck = await buildDiverseDeck(supabase, {
    limit,
    excludeIds,
    mediaType,
    genres: favorGenres.length ? favorGenres : ANCHOR_GENRES,
    avoidGenres,
  });

  // A narrowed genre list can come up short if excludeIds has already
  // eaten most of a thin genre's catalogue depth — rather than strand
  // the user with a visibly shorter deck, fall back to the plain
  // diverse default for whatever's still missing.
  if (deck.length < limit && favorGenres.length) {
    const alreadyPicked = deck.map((t) => t.id);
    const fallback = await buildDiverseDeck(supabase, {
      limit: limit - deck.length,
      excludeIds: [...excludeIds, ...alreadyPicked],
      mediaType,
      avoidGenres,
    });
    deck.push(...fallback);
  }

  return enrichDeckTitles(supabase, deck);
}
