import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { contextMultiplier } from "./context-weighting";
import { buildReasonDetail, buildColdStartDetail, type ReasonDetail } from "./explain";
import type { CircumstantialContext } from "@/lib/context/circumstantial";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export interface Recommendation {
  title: Title;
  /** One-liner — same text as detail.headline, kept as its own field so
   *  simple callers (MoodRow) don't need to reach into detail. */
  reason: string;
  detail: ReasonDetail;
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

  // Citations ("Because you loved X") only make sense for the final,
  // already-ranked short list — computing them for the whole over-fetched
  // candidate pool would be wasted work most of it never surfaces.
  const STRONG_CONTENT_THRESHOLD = 0.85;
  const matchFlags = new Map<string, { hasStrongContentMatch: boolean; hasCollaborativeEdge: boolean }>();
  for (const id of rankedIds) {
    const inContent = (contentMatches ?? []).find((m) => m.title_id === id);
    const inCollab = (collabMatches ?? []).find((m) => m.title_id === id);
    matchFlags.set(id, {
      hasStrongContentMatch: !!inContent && inContent.similarity > STRONG_CONTENT_THRESHOLD,
      hasCollaborativeEdge: !!inCollab && (!inContent || inContent.similarity < inCollab.score),
    });
  }

  const citationTargets = rankedIds.filter((id) => matchFlags.get(id)?.hasStrongContentMatch);
  const citedTitleNameByRecId = new Map<string, string>(); // recommended title id -> cited title's name
  if (citationTargets.length) {
    const citationResults = await Promise.all(
      citationTargets.map((id) =>
        supabase.rpc("most_similar_liked_title", { p_user_id: userId, p_title_id: id }).then((r) => ({ id, r }))
      )
    );
    const citedIdByRecId = new Map<string, string>();
    for (const { id, r } of citationResults) {
      const citedId = r.data?.[0]?.title_id;
      if (citedId) citedIdByRecId.set(id, citedId);
    }
    if (citedIdByRecId.size) {
      const { data: citedTitles } = await supabase
        .from("titles")
        .select("id, name")
        .in("id", [...new Set(citedIdByRecId.values())]);
      const citedNameByTitleId = new Map((citedTitles ?? []).map((t) => [t.id, t.name]));
      for (const [recId, citedId] of citedIdByRecId) {
        const name = citedNameByTitleId.get(citedId);
        if (name) citedTitleNameByRecId.set(recId, name); // drop rather than cite a blank if the name lookup failed
      }
    }
  }

  const recommendations = rankedIds
    .filter((id) => byId.has(id))
    .map((id) => {
      const title = byId.get(id)!;
      const flags = matchFlags.get(id) ?? { hasStrongContentMatch: false, hasCollaborativeEdge: false };
      const detail = buildReasonDetail({
        title,
        hasStrongContentMatch: flags.hasStrongContentMatch,
        hasCollaborativeEdge: flags.hasCollaborativeEdge,
        citedTitle: citedTitleNameByRecId.get(id) ?? null,
        context,
      });
      return {
        title,
        score: blended.get(id) ?? 0,
        reason: detail.headline,
        detail,
      };
    });

  return { recommendations, isColdStart: false };
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

  return filtered.slice(0, limit).map((title) => {
    const detail = buildColdStartDetail(title);
    return { title, score: 0, reason: detail.headline, detail };
  });
}
