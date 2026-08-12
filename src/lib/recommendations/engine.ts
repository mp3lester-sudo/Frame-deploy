import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { contextMultiplier } from "./context-weighting";
import { weatherTimeMultiplier, weatherTimeNote, type WeatherTimeSignal } from "./weather-time-weighting";
import { qualityMultiplier } from "./quality-weighting";
import { computeGenreAffinity, genreAffinityMultiplier } from "./genre-affinity";
import { computeCurationConfidence, computeAdjustmentBand } from "./curation-confidence";
import { calibrateMatchPercents } from "./match-percent";
import { diversifyRecommendations, type DiversifiableCandidate } from "./diversify";
import { buildReasonDetail, buildColdStartDetail, type ReasonDetail } from "./explain";
import { logRecommendationImpressions } from "./log-impressions";
import { dislikePenaltyMultiplier } from "./dislike-penalty";
import { implicitAffinityMultiplier } from "./implicit-affinity";
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

// Bar a real cited title has to clear (see most_similar_liked_title,
// migration 0016/0032) before "Because you loved X" fires instead of a
// generic headline. Used to be 0.85, which meant almost every
// recommendation fell back to something generic even when a real,
// specific film clearly drove the pick -- product direction: user
// curation is the whole point, so a specific citation should show up for
// any decent match, not just a near-identical one. Exported so the group
// (Movie Night / companion-blend) engine in movie-night.ts cites titles
// under the exact same bar, rather than drifting out of sync with its own
// separate constant.
export const CONTENT_MATCH_THRESHOLD = 0.5;

// Inclusion floor for match_titles_for_user (see migration 0058) --
// deliberately a lower, separate bar from CONTENT_MATCH_THRESHOLD above.
// CONTENT_MATCH_THRESHOLD decides "is this good enough to cite by name in
// the reason text"; this decides "is this even worth scoring as a
// candidate at all." Without a floor here, a user whose taste vector sits
// in a sparse region of the embedding space (or a user with few/unusual
// ratings) could get the RPC's p_match_count worth of candidates back even
// when the closest available titles are only weakly related -- which is
// how tangential, seemingly-random recommendations were sneaking into the
// final slate. Calibrated conservatively (permissive) since there's no
// production data available to sample real similarity distributions from
// this session -- raise this if weak matches are still
// getting through, lower it if the pool is coming back too thin.
const MIN_CONTENT_SIMILARITY = 0.2;

/**
 * Content-based recommendation: scores every title purely on cosine
 * similarity between the user's own taste vector -- built entirely from
 * their own ratings, see upsert_taste_vector_from_rating -- and each
 * title's embedding (match_titles_for_user, Postgres function), then
 * re-ranks and attaches a short, rule-based explanation per title.
 *
 * Deliberately does NOT blend in what other users liked. An earlier
 * version blended two collaborative-filtering signals (embedding-neighbor
 * "similar users liked" and real behavioral co-rating overlap) alongside
 * content similarity -- removed per product direction: a pick should only
 * ever be explainable by this user's own curated ratings, never "people
 * whose taste overlaps with yours." dislike-penalty.ts and
 * implicit-affinity.ts stay in the pipeline below since both are this
 * user's own behavior (their dislikes, watchlist, watch history), not
 * anyone else's.
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
    // Which surface is asking -- threaded through to
    // recommendation_impressions (see log-impressions.ts) so a later query
    // can separate "home page" served picks from "onboarding completion"
    // ones rather than lumping every caller together as one signal.
    source = "home",
  }: {
    limit?: number;
    context?: CircumstantialContext;
    weather?: WeatherTimeSignal;
    source?: string;
  } = {}
): Promise<RecommendationResult> {
  const supabase = await createClient();

  // Fires recommendation_impressions logging (migration 0051) on every
  // exit path below -- see log-impressions.ts for why this matters and
  // why it's deliberately not awaited (a logging failure/slowness must
  // never affect what the caller gets back).
  const finish = (result: RecommendationResult) => {
    void logRecommendationImpressions(userId, result.recommendations, { isColdStart: result.isColdStart, source });
    return result;
  };

  const { data: tasteVector } = await supabase
    .from("taste_vectors")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!tasteVector) {
    return finish({ recommendations: await getColdStartRecommendations(userId, limit, context), isColdStart: true });
  }

  // Over-fetch candidates well beyond `limit` — context weighting (below)
  // can knock a title's blended score up or down, or exclude it outright
  // (something_short's runtime cap), so ranking needs a wide enough pool
  // that a hard exclusion doesn't leave the final list short.
  const CANDIDATE_POOL_MULTIPLIER = 6;
  const [{ data: contentMatches }, { data: userRatings }] = await Promise.all([
    // The only candidate/scoring source: cosine similarity between this
    // user's own taste vector and every title's embedding. See the
    // function doc comment above for why the two collaborative-filtering
    // RPCs that used to sit alongside this were removed.
    supabase.rpc("match_titles_for_user", {
      p_user_id: userId,
      p_match_count: limit * CANDIDATE_POOL_MULTIPLIER,
      p_min_similarity: MIN_CONTENT_SIMILARITY,
    }),
    // Feeds genre-level negative signal (below) — deliberately a plain
    // ratings query, not the RPC above, since this needs the user's own
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

  // "User curation is the key": how much room generic signals (context/
  // weather/quality/genre-affinity/dislike/implicit, all below) get to
  // move a score away from the pure content match scales with how much
  // this user has actually curated — see curation-confidence.ts. There's
  // no crowd-vs-vector split to compute anymore since content similarity
  // is the only scoring input now.
  const highRatedCount = (userRatings ?? []).filter((r) => r.score >= 4).length;
  const confidence = computeCurationConfidence(highRatedCount);

  const blended = new Map<string, number>();
  for (const m of contentMatches ?? []) {
    blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + m.similarity);
  }

  if (blended.size === 0) {
    return finish({ recommendations: await getColdStartRecommendations(userId, limit, context), isColdStart: true });
  }

  // Context weighting needs each candidate's taste metadata (runtime,
  // violence_level, pacing, ...), so fetch full rows for the whole
  // candidate pool up front rather than only for the eventual top N.
  const candidateIds = [...blended.keys()];
  const [{ data: candidateTitles }, { data: dislikeSimilarities }, { data: implicitSimilarities }, { data: directorCredits }] =
    await Promise.all([
      supabase.from("titles").select("*").in("id", candidateIds),
      // Title-level negative feedback: how close each candidate is to the
      // user's single most similar disliked (rated <= 2.5) title -- the
      // negative counterpart to the "because you loved X" citation logic
      // below (CONTENT_MATCH_THRESHOLD). See dislike-penalty.ts and
      // migration 0052.
      supabase.rpc("similarity_to_disliked_titles", { p_user_id: userId, p_title_ids: candidateIds }),
      // Implicit signals: how close each candidate is to something on the
      // user's watchlist (deliberate intent) vs. something they watched but
      // never rated (ambiguous) -- kept as two separate columns since
      // migration 0060 so they can be weighted differently. See
      // implicit-affinity.ts.
      supabase.rpc("similarity_to_implicit_positive_titles", { p_user_id: userId, p_title_ids: candidateIds }),
      // Director, for diversify.ts's same-director check below -- not on
      // `titles` itself, lives in title_credits. Public-read table, plain
      // query rather than an RPC.
      supabase.from("title_credits").select("title_id, person_id").eq("credit_type", "director").in("title_id", candidateIds),
    ]);
  const byId = new Map((candidateTitles ?? []).map((t) => [t.id, t]));
  const directorIdByTitle = new Map<string, string>();
  for (const c of directorCredits ?? []) {
    if (!directorIdByTitle.has(c.title_id)) directorIdByTitle.set(c.title_id, c.person_id);
  }
  const dislikeSimilarityById = new Map((dislikeSimilarities ?? []).map((d) => [d.title_id, d.max_similarity]));
  const implicitWatchlistSimilarityById = new Map(
    (implicitSimilarities ?? []).map((d) => [d.title_id, d.max_similarity_watchlist])
  );
  const implicitWatchedUnratedSimilarityById = new Map(
    (implicitSimilarities ?? []).map((d) => [d.title_id, d.max_similarity_watched_unrated])
  );

  // Non-taste adjustments (context/weather/quality/genre-affinity) combine
  // as a SUM of deltas-from-1, not a product. Multiplying four independent
  // multipliers compounds fast — a date-night violence penalty (0.5x) times
  // a quality floor (0.6x) times a cold-weather mismatch (0.9x) times a
  // disliked-genre penalty (0.7x) is 0.19x, nearly zeroing out a title that
  // might still be this user's best taste match. Summing deltas instead
  // (each signal nudges up or down independently, then the total is
  // clamped) keeps every signal meaningful without any handful of soft
  // nudges accidentally acting like a hard exclusion.
  const { min: MIN_TOTAL_ADJUSTMENT, max: MAX_TOTAL_ADJUSTMENT } = computeAdjustmentBand(confidence);
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
    const dislikeMult = dislikePenaltyMultiplier(dislikeSimilarityById.get(id) ?? 0, CONTENT_MATCH_THRESHOLD);
    const implicitMult = implicitAffinityMultiplier(
      implicitWatchlistSimilarityById.get(id) ?? 0,
      implicitWatchedUnratedSimilarityById.get(id) ?? 0,
      CONTENT_MATCH_THRESHOLD
    );
    const totalDelta =
      (contextMult - 1) +
      (weatherMult - 1) +
      (qualityMult - 1) +
      (genreMult - 1) +
      (dislikeMult - 1) +
      (implicitMult - 1);
    const totalAdjustment = Math.max(MIN_TOTAL_ADJUSTMENT, Math.min(MAX_TOTAL_ADJUSTMENT, 1 + totalDelta));
    adjusted.push({ id, score: score * totalAdjustment });
  }

  // Score-sort first, then a diversity pass over the sorted pool -- see
  // diversify.ts. Without this, the top N by score alone could easily be N
  // near-duplicates of the same director/subgenre cluster, since a taste
  // vector naturally scores everything close to a favorite highly,
  // including several titles that are all close to EACH OTHER too.
  const sortedAdjusted = adjusted.sort((a, b) => b.score - a.score);
  const diversifyCandidates: DiversifiableCandidate[] = sortedAdjusted.map((a) => ({
    id: a.id,
    score: a.score,
    genres: byId.get(a.id)?.genres ?? null,
    directorId: directorIdByTitle.get(a.id) ?? null,
  }));
  const rankedIds = diversifyRecommendations(diversifyCandidates, limit).map((r) => r.id);

  if (rankedIds.length === 0) {
    return finish({ recommendations: await getColdStartRecommendations(userId, limit, context), isColdStart: true });
  }

  // Citations ("Because you loved X") only make sense for the final,
  // already-ranked short list — computing them for the whole over-fetched
  // candidate pool would be wasted work most of it never surfaces.
  //
  const matchFlags = new Map<string, { hasStrongContentMatch: boolean }>();
  for (const id of rankedIds) {
    const inContent = (contentMatches ?? []).find((m) => m.title_id === id);
    matchFlags.set(id, {
      hasStrongContentMatch: !!inContent && inContent.similarity > CONTENT_MATCH_THRESHOLD,
    });
  }

  const citationTargets = rankedIds.filter((id) => matchFlags.get(id)?.hasStrongContentMatch);
  // Up to two cited titles per recommendation, in closest-first order —
  // most_similar_liked_title (migration 0032) returns up to 2 rows instead
  // of just 1, so a pick that's genuinely close to two different things a
  // user loved can say so ("Because you loved X and Y") instead of
  // arbitrarily picking just one.
  const citedTitleNamesByRecId = new Map<string, string[]>();
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
    const citedIdsByRecId = new Map<string, string[]>();
    for (const { id, r } of citationResults) {
      const citedIds = (r.data ?? []).map((row) => row.title_id).filter((cid): cid is string => !!cid);
      if (citedIds.length) citedIdsByRecId.set(id, citedIds);
    }
    if (citedIdsByRecId.size) {
      const allCitedIds = new Set<string>();
      for (const ids of citedIdsByRecId.values()) for (const cid of ids) allCitedIds.add(cid);
      const { data: citedTitleRows } = await supabase.from("titles").select("id, name").in("id", [...allCitedIds]);
      const citedNameByTitleId = new Map((citedTitleRows ?? []).map((t) => [t.id, t.name]));
      for (const [recId, citedIds] of citedIdsByRecId) {
        // Drop any id whose name lookup failed rather than citing a blank —
        // still preserves the closest-first order from the RPC.
        const names = citedIds.map((cid) => citedNameByTitleId.get(cid)).filter((n): n is string => !!n);
        if (names.length) citedTitleNamesByRecId.set(recId, names);
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
    const flags = matchFlags.get(id) ?? { hasStrongContentMatch: false };
    const weatherNote = weather ? weatherTimeNote(title, weather) : null;
    const detail = buildReasonDetail({
      title,
      hasStrongContentMatch: flags.hasStrongContentMatch,
      citedTitles: citedTitleNamesByRecId.get(id) ?? [],
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

  return finish({ recommendations, isColdStart: false });
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
