"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildGenreAffinity, rankTeaserCandidates, buildTeaserWhy, type AnonSwipe } from "@/lib/recommendations/teaser";
import { buildDiverseDeck, type DeckTitle } from "@/lib/catalogue/diverse-deck";

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
  const { data: swipedTitles } = await supabase.from("titles").select("id, genres").in("id", swipedIds);

  const genreAffinity = buildGenreAffinity(
    swipes,
    (swipedTitles ?? []).map((t) => ({ id: t.id, genres: t.genres ?? [] }))
  );

  // Nothing to go on (e.g. every swipe was "it's fine") — no honest teaser
  // to show, let the caller fall back to its own generic copy instead.
  if ([...genreAffinity.values()].every((w) => w <= 0)) return [];

  const { data: candidates } = await supabase
    .from("titles")
    .select("id, name, poster_url, genres, weighted_rating")
    .not("id", "in", `(${swipedIds.join(",")})`)
    .order("tmdb_vote_count", { ascending: false })
    .limit(CANDIDATE_POOL_SIZE);

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

// The landing teaser deliberately uses only the first 10 (of 14) anchor
// genres — see diverse-deck.ts — to keep the pre-signup flow short; the
// post-signup /onboarding quiz uses the full set for a deeper first pass.
const LANDING_DECK_SIZE = 10;

export async function getLandingSwipeDeck(): Promise<DeckTitle[]> {
  const supabase = await createClient();
  return buildDiverseDeck(supabase, { limit: LANDING_DECK_SIZE });
}
