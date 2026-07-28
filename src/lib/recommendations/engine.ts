import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { contextMultiplier, contextNote } from "./context-weighting";
import type { CircumstantialContext } from "@/lib/context/circumstantial";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export interface Recommendation {
  title: Title;
  reason: string;
  score: number;
}

const VECTOR_WEIGHT = 0.65;
const COLLABORATIVE_WEIGHT = 0.35;

/**
 * Hybrid recommendation: blends
 *  1) content similarity — cosine distance between the user's taste vector
 *     and every title's embedding (match_titles_for_user, Postgres function)
 *  2) collaborative signal — what taste-similar users rated highly
 *     (similar_users_liked, Postgres function)
 * then re-ranks and attaches a short, rule-based explanation per title.
 *
 * Falls back to a popularity-sorted list for users with no taste vector yet
 * (new signups) instead of returning nothing.
 */
export interface RecommendationResult {
  recommendations: Recommendation[];
  /** True when there's no taste vector yet, so these are popularity fallbacks
   *  rather than personalized picks — callers use this to avoid showing a
   *  meaningless match %. */
  isColdStart: boolean;
}

export async function getRecommendationsForUser(
  userId: string,
  { limit = 5, context }: { limit?: number; context?: CircumstantialContext } = {}
): Promise<RecommendationResult> {
  const supabase = await createClient();

  const { data: tasteVector } = await supabase
    .from("taste_vectors")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!tasteVector) {
    return { recommendations: await getColdStartRecommendations(limit, context), isColdStart: true };
  }

  // Over-fetch candidates well beyond `limit` — context weighting (below)
  // can knock a title's blended score up or down, or exclude it outright
  // (something_short's runtime cap), so ranking needs a wide enough pool
  // that a hard exclusion doesn't leave the final list short.
  const CANDIDATE_POOL_MULTIPLIER = 6;
  const [{ data: contentMatches }, { data: collabMatches }] = await Promise.all([
    supabase.rpc("match_titles_for_user", { p_user_id: userId, p_match_count: limit * CANDIDATE_POOL_MULTIPLIER }),
    supabase.rpc("similar_users_liked", { p_user_id: userId, p_match_count: limit * CANDIDATE_POOL_MULTIPLIER }),
  ]);

  const blended = new Map<string, number>();
  for (const m of contentMatches ?? []) {
    blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + m.similarity * VECTOR_WEIGHT);
  }
  for (const m of collabMatches ?? []) {
    const normalized = Math.min(m.score, 1);
    blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + normalized * COLLABORATIVE_WEIGHT);
  }

  if (blended.size === 0) {
    return { recommendations: await getColdStartRecommendations(limit, context), isColdStart: true };
  }

  // Context weighting needs each candidate's taste metadata (runtime,
  // violence_level, pacing, ...), so fetch full rows for the whole
  // candidate pool up front rather than only for the eventual top N.
  const candidateIds = [...blended.keys()];
  const { data: candidateTitles } = await supabase.from("titles").select("*").in("id", candidateIds);
  const byId = new Map((candidateTitles ?? []).map((t) => [t.id, t]));

  const adjusted: { id: string; score: number }[] = [];
  for (const [id, score] of blended.entries()) {
    const title = byId.get(id);
    if (!title) continue;
    const multiplier = context ? contextMultiplier(title, context) : 1;
    if (multiplier === null) continue; // hard-excluded by this context (e.g. too long for something_short)
    adjusted.push({ id, score: score * multiplier });
  }

  const rankedIds = adjusted
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.id);

  if (rankedIds.length === 0) {
    return { recommendations: await getColdStartRecommendations(limit, context), isColdStart: true };
  }

  const recommendations = rankedIds
    .filter((id) => byId.has(id))
    .map((id) => {
      const title = byId.get(id)!;
      return {
        title,
        score: blended.get(id) ?? 0,
        reason: explainRecommendation(title, contentMatches ?? [], collabMatches ?? [], id, context),
      };
    });

  return { recommendations, isColdStart: false };
}

function explainRecommendation(
  title: Title,
  contentMatches: { title_id: string; similarity: number }[],
  collabMatches: { title_id: string; score: number }[],
  id: string,
  context?: CircumstantialContext
): string {
  const note = context ? contextNote(title, context) : null;
  const suffix = note ? ` (${note})` : "";

  const inContent = contentMatches.find((m) => m.title_id === id);
  const inCollab = collabMatches.find((m) => m.title_id === id);

  if (inContent && inContent.similarity > 0.85) {
    return `Matches your taste closely — similar tone and pacing to what you love.${suffix}`;
  }
  if (inCollab && (!inContent || inContent.similarity < inCollab.score)) {
    return `Loved by people whose taste overlaps with yours.${suffix}`;
  }
  if (title.mood_tags?.length) {
    return `Fits your recent mood: ${title.mood_tags.slice(0, 2).join(", ")}.${suffix}`;
  }
  return `Picked for you based on your Taste Graph.${suffix}`;
}

async function getColdStartRecommendations(
  limit: number,
  context?: CircumstantialContext
): Promise<Recommendation[]> {
  const supabase = await createClient();
  // Cold start still respects a hard context constraint (something_short's
  // runtime cap) — no taste signal yet, but "give me something short" is a
  // constraint, not a preference, so it should still be honored.
  const { data: titles } = await supabase
    .from("titles")
    .select("*")
    .order("tmdb_vote_count", { ascending: false })
    .limit(limit * 4);

  const filtered = (titles ?? []).filter((t) => (context ? contextMultiplier(t, context) !== null : true));

  return filtered.slice(0, limit).map((title) => ({
    title,
    score: 0,
    reason: "Popular right now — rate a few titles to personalize this.",
  }));
}
