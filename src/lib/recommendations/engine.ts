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
import type { MediaType } from "@/lib/context/media-type-cookie";

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
  /** Director display name, piggybacked onto the same title_credits query
   *  this function already runs for diversify.ts's per-director dedup
   *  (warm start) or a small dedicated lookup (cold start) — callers used
   *  to run their own separate title_credits round trip for this (see
   *  page.tsx before this field existed); now it's just here. Null when
   *  no director credit is on file. */
  director: string | null;
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
// final slate.
//
// Raised from 0.2 to 0.3 on 2026-08-14 based on the first real measurement
// of this pipeline (recommendation_impressions joined forward to ratings,
// see analyze-rec-accuracy.ts): titles landing in the displayed 75-80%
// match band -- the weakest content that was still clearing every gate --
// carried a 69% miss rate (score <= 2.5) on a real sample of 187 ratings,
// actively worse than a coin flip. 0.2 was letting genuinely tangential
// matches all the way into the scored, ranked, displayed slate. Revisit
// with the same query once post-fix volume builds up -- this is still a
// reasoned step, not a fully calibrated number.
const MIN_CONTENT_SIMILARITY = 0.3;

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
    // Required, not defaulted here on purpose -- every caller sits in a
    // different context (an interactive request with the Movies/Shows
    // toggle cookie available vs. the unauthenticated widget route with
    // no cookie at all), so the decision belongs at the call site (see
    // getActiveMediaType()), not silently baked into the engine.
    mediaType,
  }: {
    limit?: number;
    context?: CircumstantialContext;
    weather?: WeatherTimeSignal;
    source?: string;
    mediaType: MediaType;
  }
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
    return finish({ recommendations: await getColdStartRecommendations(userId, limit, context, mediaType), isColdStart: true });
  }

  // Over-fetch candidates well beyond `limit` — context weighting (below)
  // can knock a title's blended score up or down, or exclude it outright
  // (something_short's runtime cap), so ranking needs a wide enough pool
  // that a hard exclusion doesn't leave the final list short.
  const CANDIDATE_POOL_MULTIPLIER = 6;
  const [{ data: contentMatches }, { data: userRatings }, { data: dismissals }] = await Promise.all([
    // The only candidate/scoring source: cosine similarity between this
    // user's own taste vector and every title's embedding. See the
    // function doc comment above for why the two collaborative-filtering
    // RPCs that used to sit alongside this were removed.
    supabase.rpc("match_titles_for_user", {
      p_user_id: userId,
      p_match_count: limit * CANDIDATE_POOL_MULTIPLIER,
      p_min_similarity: MIN_CONTENT_SIMILARITY,
      p_media_type: mediaType,
    }),
    // Feeds genre-level negative signal (below) — deliberately a plain
    // ratings query, not the RPC above, since this needs the user's own
    // raw scores + genres, not a similarity metric.
    supabase.from("ratings").select("score, title_id").eq("user_id", userId),
    // "Don't recommend again" (swipe deck on Discover, migration 0066) --
    // a hard exclusion from the candidate pool entirely, not a scoring
    // penalty like dislike-penalty.ts below. Rating something low still
    // means "I saw this and it wasn't for me, but I don't mind being
    // reminded it exists"; dismissing means "stop showing me this,"
    // which only a full exclusion actually honors.
    supabase.from("title_dismissals").select("title_id").eq("user_id", userId),
  ]);

  const ratedTitleIds = [...new Set((userRatings ?? []).map((r) => r.title_id))];
  const dismissedTitleIds = new Set((dismissals ?? []).map((d) => d.title_id));

  const blended = new Map<string, number>();
  for (const m of contentMatches ?? []) {
    if (dismissedTitleIds.has(m.title_id)) continue;
    blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + m.similarity);
  }

  if (blended.size === 0) {
    return finish({ recommendations: await getColdStartRecommendations(userId, limit, context, mediaType), isColdStart: true });
  }

  // Context weighting needs each candidate's taste metadata (runtime,
  // violence_level, pacing, ...), so fetch full rows for the whole
  // candidate pool up front rather than only for the eventual top N.
  const candidateIds = [...blended.keys()];
  // Genre affinity's rated-title-genres lookup (bounded by this user's
  // rating count) and the four candidate-pool queries below don't depend
  // on each other at all -- both only need ids already sitting in memory
  // from the batch above -- so they used to be two sequential round trips
  // purely because they were written as separate top-level `await`s.
  // Merged into one batch now, same fix as the citation lookup above.
  const [
    { data: ratedTitleGenres },
    { data: candidateTitles },
    { data: dislikeSimilarities },
    { data: implicitSimilarities },
    { data: directorCredits },
    { data: favoriteTitlesForAffinity },
    { data: reviewedTitlesForAffinity },
  ] = await Promise.all([
    ratedTitleIds.length
      ? supabase.from("titles").select("id, genres").in("id", ratedTitleIds)
      : Promise.resolve({ data: [] as { id: string; genres: string[] | null }[] }),
    supabase.from("titles").select("*").in("id", candidateIds),
    // Title-level negative feedback: how close each candidate is to the
    // user's single most similar disliked title -- "disliked" meaning
    // either a rating <= 2.5 or a Discover swipe-deck pass (migration
    // 0068 folded title_dismissals into the same signal, so a swipe-left
    // dampens close neighbors too, not just the exact title excluded
    // above). The negative counterpart to the "because you loved X"
    // citation logic below (CONTENT_MATCH_THRESHOLD). See
    // dislike-penalty.ts and migrations 0052/0068.
    supabase.rpc("similarity_to_disliked_titles", { p_user_id: userId, p_title_ids: candidateIds, p_media_type: mediaType }),
    // Implicit signals: how close each candidate is to something on the
    // user's watchlist (deliberate intent) vs. something they watched but
    // never rated (ambiguous) -- kept as two separate columns since
    // migration 0060 so they can be weighted differently. See
    // implicit-affinity.ts.
    supabase.rpc("similarity_to_implicit_positive_titles", { p_user_id: userId, p_title_ids: candidateIds, p_media_type: mediaType }),
    // Director, for diversify.ts's same-director check below (person_id)
    // and for the Recommendation.director display field (person's name,
    // joined in the same query rather than a separate round trip -- see
    // the Recommendation.director doc comment). Not on `titles` itself,
    // lives in title_credits. Public-read tables, plain query rather than
    // an RPC.
    supabase
      .from("title_credits")
      .select("title_id, person_id, people(name)")
      .eq("credit_type", "director")
      .in("title_id", candidateIds),
    // Pyramid favorites feeding genre-affinity too, not just the taste
    // vector (migration 0075 only touches the vector) -- same "AI should
    // pull from everything" motivation. Position tapers 5.0 (#1) down to
    // 4.0 (#6), same synthetic-score convention as the SQL side.
    supabase
      .from("favorite_titles")
      .select("title_id, position, titles!inner(genres)")
      .eq("user_id", userId)
      .eq("media_type", mediaType),
    // Reviews already AI-scored at write time (writeReview, social.ts) --
    // same signal genre-affinity was missing entirely before.
    supabase
      .from("reviews")
      .select("title_id, inferred_score, titles!inner(type, genres)")
      .eq("user_id", userId)
      .eq("titles.type", mediaType)
      .not("inferred_score", "is", null),
  ]);

  const genresByRatedTitleId = new Map((ratedTitleGenres ?? []).map((t) => [t.id, t.genres]));
  const ratedTitleIdSet = new Set(ratedTitleIds);
  // Same "only when this title has no explicit rating" rule the SQL side
  // uses (migration 0075's `favorited`/`reviewed` CTEs) -- a title the
  // user also star-rated already has its genres counted via userRatings
  // below, so adding it again here would just double-weight it rather
  // than closing a real gap.
  const favoriteGenreInputs = (favoriteTitlesForAffinity ?? [])
    .filter((f) => !ratedTitleIdSet.has(f.title_id))
    .map((f) => ({
      score: 5.0 - ((f.position as number) - 1) * 0.2,
      genres: (f.titles as unknown as { genres: string[] | null } | null)?.genres ?? null,
    }));
  const reviewedGenreInputs = (reviewedTitlesForAffinity ?? [])
    .filter((rv) => !ratedTitleIdSet.has(rv.title_id) && rv.inferred_score != null)
    .map((rv) => ({
      score: rv.inferred_score as number,
      genres: (rv.titles as unknown as { genres: string[] | null } | null)?.genres ?? null,
    }));
  const genreAffinity = computeGenreAffinity([
    ...(userRatings ?? []).map((r) => ({ score: r.score, genres: genresByRatedTitleId.get(r.title_id) ?? null })),
    ...favoriteGenreInputs,
    ...reviewedGenreInputs,
  ]);

  // "User curation is the key": how much room generic signals (context/
  // weather/quality/genre-affinity/dislike/implicit, all below) get to
  // move a score away from the pure content match scales with how much
  // this user has actually curated — see curation-confidence.ts. There's
  // no crowd-vs-vector split to compute anymore since content similarity
  // is the only scoring input now.
  const highRatedCount = (userRatings ?? []).filter((r) => r.score >= 4).length;
  const confidence = computeCurationConfidence(highRatedCount);

  const byId = new Map((candidateTitles ?? []).map((t) => [t.id, t]));
  const directorIdByTitle = new Map<string, string>();
  const directorNameByTitle = new Map<string, string>();
  for (const c of (directorCredits ?? []) as unknown as {
    title_id: string;
    person_id: string;
    people: { name: string } | null;
  }[]) {
    if (!directorIdByTitle.has(c.title_id)) directorIdByTitle.set(c.title_id, c.person_id);
    if (!directorNameByTitle.has(c.title_id) && c.people?.name) directorNameByTitle.set(c.title_id, c.people.name);
  }
  const dislikeSimilarityById = new Map((dislikeSimilarities ?? []).map((d) => [d.title_id, d.max_similarity]));
  const implicitWatchlistSimilarityById = new Map(
    (implicitSimilarities ?? []).map((d) => [d.title_id, d.max_similarity_watchlist])
  );
  const implicitWatchedUnratedSimilarityById = new Map(
    (implicitSimilarities ?? []).map((d) => [d.title_id, d.max_similarity_watched_unrated])
  );

  // Non-taste adjustments (weather/quality/genre-affinity/dislike/implicit)
  // combine as a SUM of deltas-from-1, not a product. Multiplying several
  // independent multipliers compounds fast — a quality floor (0.6x) times
  // a cold-weather mismatch (0.9x) times a disliked-genre penalty (0.7x)
  // is 0.38x, nearly zeroing out a title that might still be this user's
  // best taste match. Summing deltas instead (each signal nudges up or
  // down independently, then the total is clamped) keeps every signal
  // meaningful without any handful of soft nudges accidentally acting
  // like a hard exclusion.
  //
  // Context is deliberately EXCLUDED from that shared sum-then-clamp band
  // and applied as its own separate multiplier afterward. It used to sit
  // in the same pooled delta as the other five signals, which meant its
  // real-world effect on ranking got diluted by whatever budget quality/
  // genre-affinity/dislike/implicit had already spent inside the same
  // clamp -- the reported symptom (Solo/Background watch/Something short
  // all surfacing the same titles) traced back to this: a user's context
  // pick, the one thing they explicitly chose, could end up contributing
  // only a sliver of the final score movement. Each context's own
  // multiplier is already individually bounded (0.5-1.2x, see
  // context-weighting.ts), so applying it on its own is safe and doesn't
  // reintroduce the "several multipliers compounding to near-zero"
  // problem the shared band exists to prevent.
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
      CONTENT_MATCH_THRESHOLD,
      confidence
    );
    const nonContextDelta =
      (weatherMult - 1) + (qualityMult - 1) + (genreMult - 1) + (dislikeMult - 1) + (implicitMult - 1);
    const nonContextAdjustment = Math.max(MIN_TOTAL_ADJUSTMENT, Math.min(MAX_TOTAL_ADJUSTMENT, 1 + nonContextDelta));
    const totalAdjustment = nonContextAdjustment * contextMult;
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
    return finish({ recommendations: await getColdStartRecommendations(userId, limit, context, mediaType), isColdStart: true });
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
    // Single batched round trip (most_similar_liked_titles_batch, migration
    // 0065) instead of one RPC call per citation target -- this used to be
    // Promise.all(citationTargets.map(id => supabase.rpc(...))), which is
    // genuinely parallel but still pays full HTTP/connection overhead once
    // per target (up to `limit` times) on top of whatever else the home
    // page is already fetching. See that migration's comment for why the
    // per-candidate query cost is unchanged -- only the round-trip count is.
    const { data: citationRows } = await supabase.rpc("most_similar_liked_titles_batch", {
      p_user_id: userId,
      p_title_ids: citationTargets,
      // most_similar_liked_title (migration 0016) defaults its own
      // internal p_min_similarity to 0.78 -- a separate, stricter bar
      // than CONTENT_MATCH_THRESHOLD above. Without overriding it here,
      // lowering the outer gate did nothing: more titles would attempt
      // a citation lookup, but the lookup itself kept rejecting all of
      // them under the old default. Passing the same threshold through
      // keeps both checks in sync.
      p_min_similarity: CONTENT_MATCH_THRESHOLD,
      p_media_type: mediaType,
    });
    const citedIdsByRecId = new Map<string, string[]>();
    for (const row of citationRows ?? []) {
      if (!row.cited_title_id) continue;
      const existing = citedIdsByRecId.get(row.title_id) ?? [];
      existing.push(row.cited_title_id);
      citedIdsByRecId.set(row.title_id, existing);
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
  // Raw (pre-adjustment) content similarity of the #1 displayed pick --
  // NOT the adjusted score, which is polluted by generic context/weather/
  // quality/genre-affinity multipliers that have nothing to do with how
  // close a taste match actually is. This is what calibrateMatchPercents
  // uses to decide whether the whole displayed band should read as
  // confident or hedge lower -- see that file's doc comment for why.
  const topRawSimilarity = finalIds.length ? blended.get(finalIds[0]) : undefined;
  const matchPercents = calibrateMatchPercents(
    finalIds.map((id) => adjustedScoreById.get(id) ?? 0),
    topRawSimilarity
  );

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
      director: directorNameByTitle.get(id) ?? null,
    };
  });

  return finish({ recommendations, isColdStart: false });
}

async function getColdStartRecommendations(
  userId: string,
  limit: number,
  context: CircumstantialContext | undefined,
  mediaType: MediaType
): Promise<Recommendation[]> {
  const supabase = await createClient();

  // No taste vector yet doesn't mean no watch history — a user who's rated
  // a couple of things but not enough to seed a vector, or who's mid-import,
  // still shouldn't see something they've already logged.
  const [{ data: watched }, { data: dismissals }] = await Promise.all([
    supabase.from("watch_history").select("title_id").eq("user_id", userId),
    // Same "don't recommend again" exclusion as the warm-start path above
    // -- a cold-start user can still swipe through the deck before
    // they've rated enough to get a taste vector.
    supabase.from("title_dismissals").select("title_id").eq("user_id", userId),
  ]);
  const watchedIds = new Set((watched ?? []).map((w) => w.title_id));
  const dismissedIds = new Set((dismissals ?? []).map((d) => d.title_id));

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
    .eq("type", mediaType)
    .order("weighted_rating", { ascending: false, nullsFirst: false })
    .limit((limit + watchedIds.size) * 4);

  const filtered = (titles ?? []).filter(
    (t) => !watchedIds.has(t.id) && !dismissedIds.has(t.id) && (context ? contextMultiplier(t, context) !== null : true)
  );
  const picks = filtered.slice(0, limit);

  // Same director-name lookup the warm-start path piggybacks onto its own
  // candidate-pool query -- cold start has no such query to piggyback on,
  // so this is its own small round trip, bounded by `limit` (typically 9),
  // not the catalogue.
  const { data: directorCredits } = picks.length
    ? await supabase
        .from("title_credits")
        .select("title_id, people(name)")
        .eq("credit_type", "director")
        .in(
          "title_id",
          picks.map((t) => t.id)
        )
    : { data: [] };
  const directorNameByTitle = new Map<string, string>();
  for (const c of (directorCredits ?? []) as unknown as { title_id: string; people: { name: string } | null }[]) {
    if (!directorNameByTitle.has(c.title_id) && c.people?.name) directorNameByTitle.set(c.title_id, c.people.name);
  }

  return picks.map((title) => {
    const detail = buildColdStartDetail(title);
    return {
      title,
      score: 0,
      reason: detail.headline,
      detail,
      matchPercent: null,
      director: directorNameByTitle.get(title.id) ?? null,
    };
  });
}
