"use server";

import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { buildGenreAffinity, rankTeaserCandidates, buildTeaserWhy, type AnonSwipe } from "@/lib/recommendations/teaser";
import { buildDiverseDeck, type DeckTitle } from "@/lib/catalogue/diverse-deck";
import { getActiveMediaType } from "@/lib/context/media-type";
import { isRateLimited } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/auth/client-ip";

/**
 * Anonymous pre-signup taste teaser (see teaser.ts for the scoring logic).
 * No auth required — this is intentionally callable by a logged-out
 * visitor from the landing page, reading only the public catalogue
 * (RLS: "titles are public"). Nothing here writes anything; the actual
 * signal only gets persisted once the visitor creates an account (see
 * signUp in auth.ts, which accepts this same swipe shape).
 */

const swipeSchema = z.object({ titleId: z.string().uuid(), score: z.number().min(0.5).max(5) });
const swipesInputSchema = z.array(swipeSchema).min(1).max(20);

export interface TeaserPick {
  id: string;
  name: string;
  posterUrl: string | null;
  why: string;
}

const CANDIDATE_POOL_SIZE = 400;
const TEASER_PICK_COUNT = 3;

export async function getTasteTeaser(rawSwipes: AnonSwipe[]): Promise<TeaserPick[]> {
  const swipes = swipesInputSchema.parse(rawSwipes);
  const supabase = await createClient();

  const swipedIds = swipes.map((s) => s.titleId);
  const { data: swipedTitles, error: swipedTitlesError } = await supabase.from("titles").select("id, genres").in("id", swipedIds);
  if (swipedTitlesError) console.error("[landing-teaser] swiped titles lookup", swipedTitlesError.message);

  const genreAffinity = buildGenreAffinity(
    swipes,
    (swipedTitles ?? []).map((t) => ({ id: t.id, genres: t.genres ?? [] }))
  );

  // Nothing to go on (e.g. every swipe was "it's fine") — no honest teaser
  // to show, let the caller fall back to its own generic copy instead.
  if ([...genreAffinity.values()].every((w) => w <= 0)) return [];

  const { data: candidates, error: candidatesError } = await supabase
    .from("titles")
    .select("id, name, poster_url, genres, weighted_rating")
    .not("id", "in", `(${swipedIds.join(",")})`)
    .order("tmdb_vote_count", { ascending: false })
    .limit(CANDIDATE_POOL_SIZE);
  if (candidatesError) console.error("[landing-teaser] candidates lookup", candidatesError.message);

  const ranked = rankTeaserCandidates(
    (candidates ?? []).map((c) => ({ id: c.id, genres: c.genres ?? [], weightedRating: c.weighted_rating })),
    genreAffinity
  );

  const byId = new Map((candidates ?? []).map((c) => [c.id, c]));

  return ranked.slice(0, TEASER_PICK_COUNT).map((r) => {
    const title = byId.get(r.id)!;
    return {
      id: title.id,
      name: title.name,
      posterUrl: title.poster_url,
      why: buildTeaserWhy(r.matchedGenres),
    };
  });
}

// Raised from 10 to 20 — 10 swipes (and revealing after just 6 of them,
// see MIN_SWIPES_FOR_TEASER) wasn't enough signal for the teaser to be
// reliably specific; going up to a full 20-title, genre-diverse deck (see
// diverse-deck.ts's round-robin — this spills past the 14 anchor genres
// into 2nd-best picks for the ~6 most common ones) gives the genre-affinity
// scoring in teaser.ts real signal to work with before the reveal.
const LANDING_DECK_SIZE = 20;

export async function getLandingSwipeDeck(): Promise<DeckTitle[]> {
  const supabase = await createClient();
  const mediaType = await getActiveMediaType();
  return buildDiverseDeck(supabase, { limit: LANDING_DECK_SIZE, mediaType });
}

/**
 * Growth audit finding: the teaser's results screen ("Here's what Slate
 * would show you") had zero share affordance, despite being the single
 * highest-intent unauthenticated moment in the app -- a real, personalized
 * result a visitor might actually want to send a friend, framed as "look
 * what it picked for me" rather than an ad. This freezes that result into
 * a public row (mirrors wrapped_shares, migration 0028) so it survives
 * past the visitor's own session/localStorage and gets a real link + OG
 * card (see teaser/[id]/opengraph-image.tsx) instead of just a raw app URL.
 *
 * Written via the service-role client rather than an open anon-insert RLS
 * policy (see migration 0082) -- same reasoning as the IP rate limit
 * below: this endpoint is deliberately reachable with no auth at all, so
 * it needs its own abuse guard rather than relying on auth.uid() checks
 * that a logged-out caller can never satisfy anyway.
 */
export async function shareTeaserResult(picks: TeaserPick[]): Promise<{ id: string } | { error: string }> {
  if (picks.length === 0) return { error: "Nothing to share yet" };

  if (await isRateLimited(`teaser-share:${await getClientIp()}`, { maxRequests: 20, windowSeconds: 3600 })) {
    return { error: "Too many shares from this network -- try again in a bit" };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("teaser_shares")
    .insert({ picks: picks as unknown as Record<string, unknown> })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[shareTeaserResult] insert failed:", error?.message);
    return { error: "Couldn't create a share link -- try again" };
  }

  return { id: data.id };
}
