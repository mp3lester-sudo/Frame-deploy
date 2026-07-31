import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { contextMultiplier } from "./context-weighting";
import { weatherTimeMultiplier, weatherTimeNote, type WeatherTimeSignal } from "./weather-time-weighting";
import { qualityMultiplier } from "./quality-weighting";
import { computeGenreAffinity, genreAffinityMultiplier } from "./genre-affinity";
import { calibrateMatchPercents } from "./match-percent";
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
  /** Calibrated 75-98 display percentage (see match-percent.ts) — null for
   *  cold-start picks, where a match % would be meaningless. Single source
   *  of truth so HeroRecommendation and MoodRow never need their own
   *  Math.round(score * 100) math. */
  matchPercent: number | null;
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
  {
    limit = 5,
    context,
    weather,
  }: { limit?: number; context?: CircumstantialContext; weather?: WeatherTimeSignal } = {}
): Promise<RecommendationResult> {
  const supabase = await createClient();

  const { data: tasteVector } = await supabase
    .from("taste_vectors")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!tasteVector) {
    return { recommendations: await getColdStartRecommendations(userId, limit, context), isColdStart: true };
  }

  // Over-fetch candidates well beyond `limit` — context weighting (below)
  // can knock a title's blended score up or down, or exclude it outright
  // (something_short's runtime cap), so ranking needs a wide enough pool
  // that a hard exclusion doesn't leave the final list short.
  const CANDIDATE_POOL_MULTIPLIER = 6;
  const [{ data: contentMatches }, { data: collabMatches }, { data: userRatings }] = await Promise.all([
    supabase.rpc("match_titles_for_user", { p_user_id: userId, p_match_count: limit * CANDIDATE_POOL_MULTIPLIER }),
    supabase.rpc("similar_users_liked", { p_user_id: userId, p_match_count: limit * CANDIDATE_POOL_MULTIPLIER }),
    // Feeds genre-level negative signal (below) — deliberately a plain
    // ratings query, not the RPCs above, since this needs the user's own
    // raw scores + genres, not a similarity metric.
    supabase.from("ratings").select("score, title_id").eq("user_id", userId),
  ]);

  // Genre affinity needs each rated title's genres, which the ratings query
  // above doesn't have — a second lookup, but bounded by this user's rating
  // count (typically dozens-hundreds), not the catalogue.
  const ratedTitleIds = [...new Set((userRatings ?? []).map((r) => r.title_id))];
  const { data: ratedTitleGenres } = ratedTitleIds.length
    ? await supabase.from("titles").select("id, genres").in("id", ratedTitleIds)
    : { data: [] };
  const genresByRatedTitleId = new Map((ratedTitleGenres ?? []).map((t) => [t.id, t.genres]));
  const genreAffinity = computeGenreAffinity(
    (userRatings ?? []).map((r) => ({ score: r.score, genres: genresByRatedTitleId.get(r.title_id) ?? null }))
  );

  const blended = new Map<string, number>();
  for (const m of contentMatches ?? []) {
    blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + m.similarity * VECTOR_WEIGHT);
  }
  for (const m of collabMatches ?? []) {
    const normalized = Math.min(m.score, 1);
    blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + normalized * COLLABORATIVE_WEIGHT);
  }

  if (blended.size === 0) {
    return { recommendations: await getColdStartRecommendations(userId, limit, context), isColdStart: true };
  }

  // Context weighting needs each candidate's taste metadata (runtime,
  // violence_level, pacing, ...), so fetch full rows for the whole
  // candidate pool up front rather than only for the eventual top N.
  const candidateIds = [...blended.keys()];
  const { data: candidateTitles } = await supabase.from("titles").select("*").in("id", candidateIds);
  const byId = new Map((candidateTitles ?? []).map((t) => [t.id, t]));

  // Non-taste adjustments (context/weather/quality/genre-affinity) combine
  // as a SUM of deltas-from-1, not a product. Multiplying four independent
  // multipliers compounds fast — a date-night violence penalty (0.5x) times
  // a quality floor (0.6x) times a cold-weather mismatch (0.9x) times a
  // disliked-genre penalty (0.7x) is 0.19x, nearly zeroing out a title that
  // might still be this user's best taste match. Summing deltas instead
  // (each signal nudges up or down independently, then the total is
  // clamped) keeps every signal meaningful without any handful of soft
  // nudges accidentally acting like a hard exclusion.
  const MIN_TOTAL_ADJUSTMENT = 0.45;
  const MAX_TOTAL_ADJUSTMENT = 1.6;
  const adjusted: { id: string; score: number }[] = [];
  for (const [id, score] of blended.entries()) {
    const title = byId.get(id);
    if (!title) continue;
    const contextMult = context ? contextMultiplier(title, context) : 1;
    if (contextMult === null) continue; // hard-excluded by this context (e.g. too long for something_short)
    // Weather/time is a soft nudge layered on top of the (also soft, except
    // for something_short) context multiplier — see weather-time-weighting.ts
    // for why this is never a hard exclusion.
    const weatherMult = weather ? weatherTimeMultiplier(title, weather) : 1;
    const qualityMult = qualityMultiplier(title.weighted_rating);
    const genreMult = genreAffinityMultiplier(title.genres, genreAffinity);
    const totalDelta = (contextMult - 1) + (weatherMult - 1) + (qualityMult - 1) + (genreMult - 1);
    const totalAdjustment = Math.max(MIN_TOTAL_ADJUSTMENT, Math.min(MAX_TOTAL_ADJUSTMENT, 1 + totalDelta));
    adjusted.push({ id, score: score * totalAdjustment });
  }

  const rankedIds = adjusted
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.id);

  if (rankedIds.length === 0) {
    return { recommendations: await getColdStartRecommendations(userId, limit, context), isColdStart: true };
  }

  // Citations ("Because you loved X") only make sense for the final,
  // already-ranked short list — computing them for the whole over-fetched
  // candidate pool would be wasted work most of it never surfaces.
  //
  // This used to require similarity > 0.85 before naming a specific title,
  // which in practice meant almost every recommendation fell back to a
  // generic headline ("Matches your taste closely...") even when a real,
  // specific film clearly drove the pick. Product direction: user curation
  // is the whole point, so a specific "because you loved X" should show up
  // for any decent match, not just the rare near-identical one. Still never
  // fabricated — most_similar_liked_title (migration 0016) only returns a
  // hit when one genuinely exists above this bar.
  const CONTENT_MATCH_THRESHOLD = 0.5;
  const matchFlags = new Map<string, { hasStrongContentMatch: boolean; hasCollaborativeEdge: boolean }>();
  for (const id of rankedIds) {
    const inContent = (contentMatches ?? []).find((m) => m.title_id === id);
    const inCollab = (collabMatches ?? []).find((m) => m.title_id === id);
    matchFlags.set(id, {
      hasStrongContentMatch: !!inContent && inContent.similarity > CONTENT_MATCH_THRESHOLD,
      hasCollaborativeEdge: !!inCollab && (!inContent || inContent.similarity < inCollab.score),
    });
  }

  const citationTargets = rankedIds.filter((id) => matchFlags.get(id)?.hasStrongContentMatch);
  const citedTitleNameByRecId = new Map<string, string>(); // recommended title id -> cited title's name
  if (citationTargets.length) {
    const citationResults = await Promise.all(
      citationTargets.map((id) =>
        supabase
          .rpc("most_similar_liked_title", {
            p_user_id: userId,
            p_title_id: id,
            // most_similar_liked_title (migration 0016) defaults its own
            // internal p_min_similarity to 0.78 -- a separate, stricter bar
            // than CONTENT_MATCH_THRESHOLD above. Without overriding it here,
            // lowering the outer gate did nothing: more titles would attempt
            // a citation lookup, but the lookup itself kept rejecting all of
            // them under the old default. Passing the same threshold through
            // keeps both checks in sync.
            p_min_similarity: CONTENT_MATCH_THRESHOLD,
          })
          .then((r) => ({ id, r }))
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

  // Use the post-context/post-weather adjusted score (not the raw blend)
  // both for what's displayed as `score` and for match-% calibration below —
  // it's what actually decided the ranking, so it's what should be reflected
  // back as "how good a match, right now."
  const adjustedScoreById = new Map(adjusted.map((a) => [a.id, a.score]));
  const finalIds = rankedIds.filter((id) => byId.has(id));
  const matchPercents = calibrateMatchPercents(finalIds.map((id) => adjustedScoreById.get(id) ?? 0));

  const recommendations = finalIds.map((id, i) => {
    const title = byId.get(id)!;
    const flags = matchFlags.get(id) ?? { hasStrongContentMatch: false, hasCollaborativeEdge: false };
    const weatherNote = weather ? weatherTimeNote(title, weather) : null;
    const detail = buildReasonDetail({
      title,
      hasStrongContentMatch: flags.hasStrongContentMatch,
      hasCollaborativeEdge: flags.hasCollaborativeEdge,
      citedTitle: citedTitleNameByRecId.get(id) ?? null,
      context,
      weatherNote,
    });
    return {
      title,
      score: adjustedScoreById.get(id) ?? 0,
      reason: detail.headline,
      detail,
      matchPercent: matchPercents[i],
    };
  });

  return { recommendations, isColdStart: false };
}

async function getColdStartRecommendations(
  userId: string,
  limit: number,
  context?: CircumstantialContext
): Promise<Recommendation[]> {
  const supabase = await createClient();

  // No taste vector yet doesn't mean no watch history — a user who's rated
  // a couple of things but not enough to seed a vector, or who's mid-import,
  // still shouldn't see something they've already logged.
  const { data: watched } = await supabase.from("watch_history").select("title_id").eq("user_id", userId);
  const watchedIds = new Set((watched ?? []).map((w) => w.title_id));

  // Cold start still respects a hard context constraint (something_short's
  // runtime cap) — no taste signal yet, but "give me something short" is a
  // constraint, not a preference, so it should still be honored.
  //
  // Ordered by weighted_rating (not raw popularity) since there's no taste
  // signal to lean on yet — "best reviewed" is the most sensible default
  // first impression a new user can get.
  const { data: titles } = await supabase
    .from("titles")
    .select("*")
    .order("weighted_rating", { ascending: false, nullsFirst: false })
    .limit((limit + watchedIds.size) * 4);

  const filtered = (titles ?? []).filter(
    (t) => !watchedIds.has(t.id) && (context ? contextMultiplier(t, context) !== null : true)
  );

  return filtered.slice(0, limit).map((title) => {
    const detail = buildColdStartDetail(title);
    return { title, score: 0, reason: detail.headline, detail, matchPercent: null };
  });
}
