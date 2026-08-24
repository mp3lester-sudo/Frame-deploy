import type { SupabaseClient } from "@supabase/supabase-js";
import type { GridTitle } from "@/components/title-card";
import { DISCOVER_PAGE_SIZE, SEARCH_PAGE_SIZE } from "@/lib/constants/catalogue";

/**
 * Personalization audit finding: Discover's browse grid AND title search
 * both sorted strictly by
 * weighted_rating (public.titles) -- the same order for every user
 * regardless of taste, despite the taste-vector embedding infrastructure
 * already existing and working well on the home page rail. The fix
 * reuses that infrastructure rather than inventing new signal: blend
 * each candidate's taste-vector similarity (title_similarity_for_user,
 * migration 0071) with its weighted_rating, weighted toward taste per the
 * audit's Tier 1/2-dominant / Tier 5-floor signal hierarchy. Despite the
 * filename, everything in this module is generic to "a bounded,
 * already-filtered pool of titles" -- Discover's filter and Search's
 * query-word match are just two different ways of producing that pool,
 * so both reuse the exact same blend/rank/lookup functions rather than
 * each growing their own copy.
 *
 * Discover/Search's grid has no server-side session state to persist a
 * previously-computed order across "Load more" requests, so every caller
 * (initial page render and every subsequent load-more page) recomputes
 * the blend fresh from the same deterministic inputs (weighted_rating
 * order + a stable similarity lookup) rather than caching an order
 * anywhere.
 */

// 8x page size mirrors engine.ts's CANDIDATE_POOL_MULTIPLIER convention --
// large enough that a genuinely well-differentiated taste signal has real
// room to reorder, small enough that this stays one index-backed range()
// query rather than a full-catalogue scan. Titles ranked beyond this pool
// (by weighted_rating) are never reordered -- see the pagination handling
// in loadMoreDiscoverTitles, which continues in plain weighted_rating
// order past this boundary.
export const DISCOVER_CANDIDATE_POOL_SIZE = DISCOVER_PAGE_SIZE * 8;

// Same reasoning, same 8x multiplier, applied to title search (see
// loadMoreSearchTitles in src/lib/actions/catalogue.ts and
// src/app/search/page.tsx): search's text-match filter already narrows
// the catalogue down to "contains every query word," so this is the same
// "bounded pool re-ranked by taste, not a full scan" shape as Discover,
// just against a query-matched candidate set instead of a filter-matched
// one. 24 * 8 = 192, still evenly divisible by SEARCH_PAGE_SIZE so no
// page straddles the pool boundary.
export const SEARCH_CANDIDATE_POOL_SIZE = SEARCH_PAGE_SIZE * 8;

const TASTE_WEIGHT = 0.6;
const QUALITY_WEIGHT = 0.4;

export type PersonalizableTitle = GridTitle & { weighted_rating: number | null };

/**
 * Pure blend: taste-similarity dominant (Tier 1/2), weighted_rating as the
 * remaining weight and the sole signal when no similarity exists for a
 * title -- cold start, a logged-out viewer, or a title without an
 * embedding yet (see the personalization audit's signal hierarchy, where
 * catalog metadata is a floor/tiebreaker, never the primary sort once real
 * signal exists). similarity is pgvector's 1 - cosine_distance, expected
 * in [0, 1] but clamped since it can dip slightly negative for very
 * dissimilar vectors.
 */
export function blendDiscoverScore(weightedRating: number | null, similarity: number | undefined): number {
  const qualityScore = Math.max(0, Math.min(1, (weightedRating ?? 0) / 10));
  if (similarity === undefined) return qualityScore;
  const tasteScore = Math.max(0, Math.min(1, similarity));
  return TASTE_WEIGHT * tasteScore + QUALITY_WEIGHT * qualityScore;
}

/**
 * Stable sort: ties (most commonly "no similarity data for either title",
 * i.e. a cold-start viewer) fall back to the original weighted_rating
 * order rather than an arbitrary one, so a viewer with no taste signal
 * yet sees exactly the pre-personalization ordering.
 */
export function rankTitlesByBlendedScore<T extends PersonalizableTitle>(
  titles: T[],
  similarityByTitleId: Map<string, number>
): T[] {
  return titles
    .map((title, index) => ({
      title,
      index,
      score: blendDiscoverScore(title.weighted_rating, similarityByTitleId.get(title.id)),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.title);
}

/**
 * Given a candidate pool already fetched in weighted_rating order (the
 * existing, pre-personalization behavior), fetch this viewer's similarity
 * to each candidate and return the pool re-ranked. Cold-start/logged-out
 * viewers, or viewers without a taste vector for this media type yet, get
 * back the exact same order they always did -- title_similarity_for_user
 * returns zero rows when no taste_vectors row exists for (user, type)
 * (see migration 0071), so similarityByTitleId stays empty and every
 * title falls through to quality-only scoring, which sorts identically to
 * the plain weighted_rating order it's replacing.
 */
export async function personalizeDiscoverPool<T extends PersonalizableTitle>(
  supabase: SupabaseClient,
  titles: T[],
  viewerId: string | undefined,
  mediaType: string
): Promise<T[]> {
  if (!viewerId || titles.length === 0) return titles;
  const { data, error } = await supabase.rpc("title_similarity_for_user", {
    p_user_id: viewerId,
    p_title_ids: titles.map((t) => t.id),
    p_media_type: mediaType,
  });
  if (error) {
    // Best-effort personalization -- fall back to the pool's existing
    // weighted_rating order rather than failing the whole grid.
    console.error("[discover] title_similarity_for_user failed:", error.message);
    return titles;
  }
  const similarityByTitleId = new Map<string, number>(
    (data ?? []).map((row: { title_id: string; similarity: number }) => [row.title_id, row.similarity])
  );
  return rankTitlesByBlendedScore(titles, similarityByTitleId);
}
