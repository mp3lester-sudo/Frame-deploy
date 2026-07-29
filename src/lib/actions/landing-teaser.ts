"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildGenreAffinity, rankTeaserCandidates, buildTeaserWhy, type AnonSwipe } from "@/lib/recommendations/teaser";

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

/**
 * A diverse ~10-title swipe deck for the landing page's anonymous teaser —
 * deliberately one strong title per anchor genre rather than raw
 * popularity, since a deck of all-the-same-genre blockbusters wouldn't
 * generate enough genre spread for the teaser to say anything meaningful
 * after only 6-8 swipes.
 */
const ANCHOR_GENRES = [
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
];

export interface DeckTitle {
  id: string;
  name: string;
  overview: string | null;
  posterUrl: string | null;
  year: string | null;
  runtimeMinutes: number | null;
  genres: string[];
}

export async function getLandingSwipeDeck(): Promise<DeckTitle[]> {
  const supabase = await createClient();

  const results = await Promise.all(
    ANCHOR_GENRES.map((genre) =>
      supabase
        .from("titles")
        .select("id, name, overview, poster_url, release_date, runtime_minutes, genres")
        .contains("genres", [genre])
        .not("poster_url", "is", null)
        .order("weighted_rating", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
    )
  );

  const seen = new Set<string>();
  const deck: DeckTitle[] = [];
  for (const { data: t } of results) {
    if (!t || seen.has(t.id)) continue; // same title can be each other's top pick in >1 genre
    seen.add(t.id);
    deck.push({
      id: t.id,
      name: t.name,
      overview: t.overview,
      posterUrl: t.poster_url,
      year: t.release_date?.slice(0, 4) ?? null,
      runtimeMinutes: t.runtime_minutes,
      genres: t.genres ?? [],
    });
  }
  return deck;
}
