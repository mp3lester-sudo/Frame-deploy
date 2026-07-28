import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

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
  { limit = 5 }: { limit?: number } = {}
): Promise<RecommendationResult> {
  const supabase = await createClient();

  const { data: tasteVector } = await supabase
    .from("taste_vectors")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!tasteVector) {
    return { recommendations: await getColdStartRecommendations(limit), isColdStart: true };
  }

  const [{ data: contentMatches }, { data: collabMatches }] = await Promise.all([
    supabase.rpc("match_titles_for_user", { p_user_id: userId, p_match_count: limit * 4 }),
    supabase.rpc("similar_users_liked", { p_user_id: userId, p_match_count: limit * 4 }),
  ]);

  const blended = new Map<string, number>();
  for (const m of contentMatches ?? []) {
    blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + m.similarity * VECTOR_WEIGHT);
  }
  for (const m of collabMatches ?? []) {
    const normalized = Math.min(m.score, 1);
    blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + normalized * COLLABORATIVE_WEIGHT);
  }

  const rankedIds = [...blended.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (rankedIds.length === 0) {
    return { recommendations: await getColdStartRecommendations(limit), isColdStart: true };
  }

  const { data: titles } = await supabase.from("titles").select("*").in("id", rankedIds);
  const byId = new Map((titles ?? []).map((t) => [t.id, t]));

  const recommendations = rankedIds
    .filter((id) => byId.has(id))
    .map((id) => {
      const title = byId.get(id)!;
      return {
        title,
        score: blended.get(id) ?? 0,
        reason: explainRecommendation(title, contentMatches ?? [], collabMatches ?? [], id),
      };
    });

  return { recommendations, isColdStart: false };
}

function explainRecommendation(
  title: Title,
  contentMatches: { title_id: string; similarity: number }[],
  collabMatches: { title_id: string; score: number }[],
  id: string
): string {
  const inContent = contentMatches.find((m) => m.title_id === id);
  const inCollab = collabMatches.find((m) => m.title_id === id);

  if (inContent && inContent.similarity > 0.85) {
    return `Matches your taste closely — similar tone and pacing to what you love.`;
  }
  if (inCollab && (!inContent || inContent.similarity < inCollab.score)) {
    return `Loved by people whose taste overlaps with yours.`;
  }
  if (title.mood_tags?.length) {
    return `Fits your recent mood: ${title.mood_tags.slice(0, 2).join(", ")}.`;
  }
  return `Picked for you based on your Taste Graph.`;
}

async function getColdStartRecommendations(limit: number): Promise<Recommendation[]> {
  const supabase = await createClient();
  const { data: titles } = await supabase
    .from("titles")
    .select("*")
    .order("tmdb_vote_count", { ascending: false })
    .limit(limit);

  return (titles ?? []).map((title) => ({
    title,
    score: 0,
    reason: "Popular right now — rate a few titles to personalize this.",
  }));
}
