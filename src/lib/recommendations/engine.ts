import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/with-timeout";
import { captureServerError } from "@/lib/monitoring/sentry-server";
import type { Database } from "@/lib/supabase/types";
import { contextMultiplier } from "./context-weighting";
import { weatherTimeMultiplier, weatherTimeNote, type WeatherTimeSignal } from "./weather-time-weighting";
import { qualityMultiplier, passesQualityFloor, MIN_RECOMMENDABLE_RATING } from "./quality-weighting";
import { computeGenreAffinity, genreAffinityMultiplier, genreAffinityNote } from "./genre-affinity";
import { computeDecadeAffinity, decadeAffinityMultiplier, decadeAffinityNote } from "./decade-affinity";
import { computeCurationConfidence, computeAdjustmentBand } from "./curation-confidence";
import { calibrateMatchPercents } from "./match-percent";
import { diversifyRecommendations, type DiversifiableCandidate } from "./diversify";
import { buildReasonDetail, buildColdStartDetail, buildExplorationDetail, type ReasonDetail } from "./explain";
import { computeDominantGenres, pickExplorationCandidate, type ExplorationCandidate } from "./exploration";
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
  /** Recommendation intelligence audit finding #2: true for the one slot
   *  (if any) deliberately picked outside this user's usual genres rather
   *  than for being the single best taste match -- see exploration.ts.
   *  Undefined/false for every ordinary exploit pick and for cold start,
   *  which has no "usual genres" to diverge from yet. Callers that don't
   *  care can ignore this field entirely; it exists so a UI that wants to
   *  honestly badge this pick as different (rather than silently blending
   *  it in as another top match) has a real signal to key off of. */
  isExploration?: boolean;
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

// Caps how long the page will wait on match_titles_for_user specifically
// -- this is the one call in the Promise.all below with no upper bound of
// its own, and a slow/cold ANN index (or one running without migration
// 0077's fix -- see that migration's comment for the full story) can make
// it take several seconds under load instead of the usual <100ms. Since
// nothing downstream can start scoring candidates until this resolves, an
// unbounded slow call here used to block the *entire* page's
// server-rendered response, not just this section. 4s is generous for a
// healthy query but still well short of making a visitor sit through a
// query that's already run long past the point of being worth waiting for.
const MATCH_TITLES_TIMEOUT_MS = 6000;

// Recommendation intelligence audit finding #4: recommendations were
// completely static between visits -- the same DB state always produces
// the exact same top-N, so a user checking back five minutes (or a day)
// later saw an identical slate with zero variation, and
// recommendation_impressions (migration 0051) was purely write-only --
// nothing ever read it back to notice or correct for that (see finding
// #5's doc comment in the `finish` closure below for the same blind-spot
// pattern). This closes that loop: a mild, self-clearing penalty for a
// title that appeared in this user's last few visits to this same
// surface. Soft, not a hard exclude -- a title can genuinely still be the
// single best match and the user just hasn't acted on it yet -- but it's
// real enough that a title naturally rotates out of the top slots after a
// few repeat visits and rotates back in once it ages out of the lookback
// window, instead of sitting frozen at #1 forever.
const RECENT_IMPRESSION_LOOKBACK_VISITS = 3;
const RECENT_IMPRESSION_PENALTY_MULTIPLIER = 0.85;

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

/**
 * Recommendation intelligence audit finding #1: "does this user have real
 * signal we should be recommending from" used to only ever be checked
 * implicitly, by whether a taste_vectors row happened to exist -- which
 * conflates "genuinely new user" with "has signal but the vector never
 * got (re)computed." This makes the check explicit and reusable so both
 * self-heal sites below (missing row, and a row that exists but produced
 * zero content matches) can share it instead of diverging.
 */
async function hasQualifyingRecommendationSignal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  mediaType: MediaType
): Promise<boolean> {
  const [{ count: ratingCount }, { count: favoriteCount }, { count: reviewCount }] = await Promise.all([
    supabase
      .from("ratings")
      .select("title_id, titles!inner(type)", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("titles.type", mediaType),
    supabase
      .from("favorite_titles")
      .select("title_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("media_type", mediaType),
    supabase
      .from("reviews")
      .select("title_id, titles!inner(type)", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("titles.type", mediaType)
      .not("inferred_score", "is", null),
  ]);
  return (ratingCount ?? 0) > 0 || (favoriteCount ?? 0) > 0 || (reviewCount ?? 0) > 0;
}

/** Shared by the initial fetch and the finding #1 self-heal retry below,
 *  so a recompute-and-retry doesn't have to duplicate the RPC call shape. */
async function fetchContentMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  mediaType: MediaType,
  matchCount: number,
  onDegraded: (reason: "timeout" | "error", error?: unknown) => void
) {
  const p = Promise.resolve(
    supabase.rpc("match_titles_for_user", {
      p_user_id: userId,
      p_match_count: matchCount,
      p_min_similarity: MIN_CONTENT_SIMILARITY,
      p_media_type: mediaType,
    })
  );
  const { data } = await withTimeout(
    p,
    MATCH_TITLES_TIMEOUT_MS,
    { data: [] as Awaited<typeof p>["data"], error: null } as Awaited<typeof p>,
    onDegraded
  );
  return data;
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
    // Accepts either an already-resolved signal or a still-in-flight
    // Promise -- callers (see page.tsx's HomeRecommendationsSection) kick
    // off the weather fetch and this function's own initial DB work at
    // the same time rather than awaiting weather first and paying for
    // both sequentially, since weather isn't actually needed until deep
    // inside the scoring loop below. Awaiting a non-Promise value here is
    // a no-op (per the language spec), so passing an already-resolved
    // value still works unchanged for every other/older caller.
    weather?: WeatherTimeSignal | Promise<WeatherTimeSignal | null> | null;
    source?: string;
    mediaType: MediaType;
  }
): Promise<RecommendationResult> {
  const supabase = await createClient();

  // Recommendation intelligence audit finding #5: match_titles_for_user,
  // similarity_to_disliked_titles, similarity_to_implicit_positive_titles,
  // and most_similar_liked_titles_batch below all silently degrade to an
  // empty-result fallback past their timeout -- correct behavior for never
  // blocking a page render, but until migration 0079 there was no record
  // ANYWHERE that a degradation happened, only that a request completed.
  // That blind spot is exactly how finding #1's live bug (a 500+-rating
  // account silently getting served cold-start picks) went unnoticed:
  // nothing distinguished "this signal degraded" from "this signal
  // genuinely found nothing." Each withTimeout call below is passed a
  // markDegraded callback that appends here instead of failing silently;
  // whatever accumulates gets written to
  // recommendation_impressions.degraded_signals (see log-impressions.ts)
  // so it's queryable after the fact, and a real error (as opposed to a
  // plain timeout) also gets a Sentry breadcrumb via captureServerError.
  const degradedSignals: string[] = [];
  const markDegraded = (signal: string) => (reason: "timeout" | "error", error?: unknown) => {
    degradedSignals.push(signal);
    if (reason === "error") {
      captureServerError(error, { userId, mediaType, source, signal, stage: "recommendation-signal-degraded" });
    }
  };

  // Fires recommendation_impressions logging (migration 0051) on every
  // exit path below -- see log-impressions.ts for why this matters and
  // why it's deliberately not awaited (a logging failure/slowness must
  // never affect what the caller gets back).
  const finish = (result: RecommendationResult) => {
    void logRecommendationImpressions(userId, result.recommendations, {
      isColdStart: result.isColdStart,
      source,
      degradedSignals: degradedSignals.length ? degradedSignals : undefined,
    });
    return result;
  };

  // Scoped by media_type, not just user_id -- since migration 0071 made
  // (user_id, media_type) the composite key, a user with both a 'movie'
  // and a 'tv' vector has two rows here. Every other taste_vectors lookup
  // in the codebase (hidden-gem.ts, matchmaking/compute.ts,
  // reengagement/campaign.ts, movie-night.ts) already scopes by
  // media_type; this one didn't, so .maybeSingle() silently errored on
  // any dual-mode user (more than one row matched) and got treated as
  // "no taste vector at all" -- forcing every recommendation surface
  // (Home, Discover's swipe deck, MoodRow) into the cold-start
  // popularity fallback for that user regardless of how many ratings
  // they actually had.
  let { data: tasteVector } = await supabase
    .from("taste_vectors")
    .select("user_id")
    .eq("user_id", userId)
    .eq("media_type", mediaType)
    .maybeSingle();

  // Recommendation intelligence audit finding #1: tracks whether a
  // recompute has already been attempted this request, so the second
  // self-heal site below (a taste vector that exists but produced zero
  // content matches) doesn't redundantly recompute right after the first
  // one already just ran.
  let selfHealed = false;

  if (!tasteVector) {
    // A missing taste_vectors row was unconditionally treated as
    // "genuinely new user, no signal yet" and routed straight to the
    // cold-start popularity fallback. But the row can go missing for a
    // user who has plenty of qualifying signal too -- a Letterboxd import
    // writing ratings through a path that doesn't trigger a recompute, a
    // migration-era account, any write path that skips
    // upsert_taste_vector_from_rating. A 500+-rating account silently
    // getting served "Popular right now" picks (the bug this finding is
    // named for) is exactly that: not a cold-start user, a stale/missing
    // vector for a warm one.
    //
    // Self-heal once before accepting cold start: if the user has any
    // qualifying signal for this media type, recompute synchronously --
    // recompute_taste_vector_for_user_for_type is a fast DB-only function
    // (no OpenAI round trip), the same call the Pyramid-reorder path in
    // profile.ts already makes on every edit -- and re-read. Only fall
    // through to true cold start below if recompute still leaves no row,
    // meaning the user genuinely has no signal yet.
    if (await hasQualifyingRecommendationSignal(supabase, userId, mediaType)) {
      const { error: recomputeError } = await supabase.rpc("recompute_taste_vector_for_user_for_type", {
        p_user_id: userId,
        p_media_type: mediaType,
      });
      if (recomputeError) {
        markDegraded("taste-vector-self-heal")("error", recomputeError);
      } else {
        selfHealed = true;
        const { data: healedVector } = await supabase
          .from("taste_vectors")
          .select("user_id")
          .eq("user_id", userId)
          .eq("media_type", mediaType)
          .maybeSingle();
        tasteVector = healedVector;
      }
    }
  }

  if (!tasteVector) {
    return finish({ recommendations: await getColdStartRecommendations(userId, limit, context, mediaType), isColdStart: true });
  }

  // Over-fetch candidates well beyond `limit` — context weighting (below)
  // can knock a title's blended score up or down, or exclude it outright
  // (something_short's runtime cap), so ranking needs a wide enough pool
  // that a hard exclusion doesn't leave the final list short.
  //
  // 8, not 6: at 6x, three DIFFERENT hard exclusions stack in the same
  // loop below -- a dismissed title, a context exclusion (e.g.
  // something_short's runtime cap, which disproportionately knocks out
  // movies vs. TV episodes), and the quality floor (roughly half of raw
  // matches don't clear MIN_RECOMMENDABLE_RATING by design, see
  // quality-weighting.ts) -- and for Movies specifically, that combined
  // attrition could push the survivor count below the 8 needed to fill
  // `limit=9`'s hero pool (1 hero + 2 reserve, see
  // HomeRecommendationsSection in page.tsx). When that happened, the
  // reserve pool came back empty and "Not feeling it? Generate another
  // pick" silently had nothing to cycle to, so it just didn't render
  // (recommendation-reveal.tsx only shows it when picks.length > 1).
  // Diversify never returns fewer than `limit` once enough candidates
  // exist, so widening the raw net upstream is the actual fix rather
  // than anything in diversify.ts itself.
  const CANDIDATE_POOL_MULTIPLIER = 8;
  const [contentMatchesResult, { data: userRatings }, { data: dismissals }] = await Promise.all([
    // The only candidate/scoring source: cosine similarity between this
    // user's own taste vector and every title's embedding. See the
    // function doc comment above for why the two collaborative-filtering
    // RPCs that used to sit alongside this were removed. Timed out
    // separately (see MATCH_TITLES_TIMEOUT_MS above) -- past the cap this
    // resolves to an empty match list, same shape as "no candidates
    // found," which correctly routes through the existing cold-start
    // fallback below instead of hanging the whole page.
    fetchContentMatches(
      supabase,
      userId,
      mediaType,
      limit * CANDIDATE_POOL_MULTIPLIER,
      markDegraded("match_titles_for_user")
    ),
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
  let contentMatches = contentMatchesResult;

  const ratedTitleIds = [...new Set((userRatings ?? []).map((r) => r.title_id))];
  const dismissedTitleIds = new Set((dismissals ?? []).map((d) => d.title_id));

  const blended = new Map<string, number>();
  for (const m of contentMatches ?? []) {
    if (dismissedTitleIds.has(m.title_id)) continue;
    blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + m.similarity);
  }

  if (blended.size === 0 && !selfHealed) {
    // Second self-heal site for finding #1: a taste_vectors row existing
    // is necessary but not sufficient -- if it was computed once and never
    // refreshed (no rating since has ever triggered a recompute, or the
    // row predates an embedding backfill), match_titles_for_user can
    // legitimately return zero candidates even though the user has real,
    // current signal. This is the failure mode the first self-heal site
    // above (missing row) doesn't cover, and live verification after
    // shipping that fix showed it's the one actually hit by the account
    // this finding was originally reported against -- the row existed,
    // content matches still came back empty. Same recompute-and-retry
    // shape, once, gated by the same qualifying-signal check.
    if (await hasQualifyingRecommendationSignal(supabase, userId, mediaType)) {
      const { error: recomputeError } = await supabase.rpc("recompute_taste_vector_for_user_for_type", {
        p_user_id: userId,
        p_media_type: mediaType,
      });
      if (recomputeError) {
        markDegraded("taste-vector-self-heal")("error", recomputeError);
      } else {
        selfHealed = true;
        contentMatches = await fetchContentMatches(
          supabase,
          userId,
          mediaType,
          limit * CANDIDATE_POOL_MULTIPLIER,
          markDegraded("match_titles_for_user")
        );
        for (const m of contentMatches ?? []) {
          if (dismissedTitleIds.has(m.title_id)) continue;
          blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + m.similarity);
        }
      }
    }
  }

  if (blended.size === 0 && selfHealed) {
    // Third layer for finding #1: the recompute-based self-heal above
    // already ran (the taste vector was confirmed present and fresh) but
    // content matches still came back empty. At this point the most
    // likely explanation left is a transient slow/timed-out call to
    // match_titles_for_user itself -- a connection-pool cold start, a
    // brief load spike -- not a genuine "nothing matches" result, since a
    // freshly-recomputed vector for a qualifying account should never
    // legitimately match zero titles in a ~36k-title catalogue. Live
    // verification after the first two self-heal fixes shipped showed
    // exactly this: the same account, same code, same request shape,
    // flipping between a real personalized slate and this empty result
    // across otherwise-identical page loads -- the signature of a
    // borderline-timing issue, not a data issue. One more bare retry, no
    // recompute needed this time, is cheap insurance against that
    // flakiness. (The underlying fix is migration 0077, which corrects a
    // query-plan bug that kept this RPC from using its vector index at
    // all -- this retry is a safety net on top of that, not a
    // replacement for it.)
    contentMatches = await fetchContentMatches(
      supabase,
      userId,
      mediaType,
      limit * CANDIDATE_POOL_MULTIPLIER,
      markDegraded("match_titles_for_user-retry")
    );
    for (const m of contentMatches ?? []) {
      if (dismissedTitleIds.has(m.title_id)) continue;
      blended.set(m.title_id, (blended.get(m.title_id) ?? 0) + m.similarity);
    }
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
    { data: recentImpressions },
  ] = await Promise.all([
    ratedTitleIds.length
      ? supabase.from("titles").select("id, genres, release_date").in("id", ratedTitleIds)
      : Promise.resolve({ data: [] as { id: string; genres: string[] | null; release_date: string | null }[] }),
    supabase.from("titles").select("*").in("id", candidateIds),
    // Title-level negative feedback: how close each candidate is to the
    // user's single most similar disliked title -- "disliked" meaning
    // either a rating <= 2.5 or a Discover swipe-deck pass (migration
    // 0068 folded title_dismissals into the same signal, so a swipe-left
    // dampens close neighbors too, not just the exact title excluded
    // above). The negative counterpart to the "because you loved X"
    // citation logic below (CONTENT_MATCH_THRESHOLD). See
    // dislike-penalty.ts and migrations 0052/0068.
    // Bounded (candidateIds is at most limit * CANDIDATE_POOL_MULTIPLIER
    // ids), but still a cosine-distance computation across every one of
    // this user's disliked/dismissed titles times every candidate -- for
    // an account with a long rating history that's real work, and it's
    // one of seven queries in this same Promise.all, so a slow one here
    // holds up the other six just as much as match_titles_for_user did.
    // Same 3s cap-and-degrade treatment: past it, this signal just
    // contributes nothing rather than blocking the page.
    (() => {
      const p = Promise.resolve(
        supabase.rpc("similarity_to_disliked_titles", { p_user_id: userId, p_title_ids: candidateIds, p_media_type: mediaType })
      );
      return withTimeout(
        p,
        3000,
        { data: [] as Awaited<typeof p>["data"], error: null } as Awaited<typeof p>,
        markDegraded("similarity_to_disliked_titles")
      );
    })(),
    // Implicit signals: how close each candidate is to something on the
    // user's watchlist (deliberate intent) vs. something they watched but
    // never rated (ambiguous) -- kept as two separate columns since
    // migration 0060 so they can be weighted differently. See
    // implicit-affinity.ts. Same bounded-but-still-real-work shape and
    // same 3s cap as the dislike-similarity query above.
    (() => {
      const p = Promise.resolve(
        supabase.rpc("similarity_to_implicit_positive_titles", { p_user_id: userId, p_title_ids: candidateIds, p_media_type: mediaType })
      );
      return withTimeout(
        p,
        3000,
        { data: [] as Awaited<typeof p>["data"], error: null } as Awaited<typeof p>,
        markDegraded("similarity_to_implicit_positive_titles")
      );
    })(),
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
      .select("title_id, position, titles!inner(genres, release_date)")
      .eq("user_id", userId)
      .eq("media_type", mediaType),
    // Reviews already AI-scored at write time (writeReview, social.ts) --
    // same signal genre-affinity was missing entirely before.
    supabase
      .from("reviews")
      .select("title_id, inferred_score, titles!inner(type, genres, release_date)")
      .eq("user_id", userId)
      .eq("titles.type", mediaType)
      .not("inferred_score", "is", null),
    // Recommendation intelligence audit finding #4 (see
    // RECENT_IMPRESSION_LOOKBACK_VISITS above): the last few visits' worth
    // of served titles on this same surface, read back from
    // recommendation_impressions to drive the freshness penalty below.
    // That table is RLS-locked to the service-role client only (migration
    // 0051), same as its own write path in log-impressions.ts, so this
    // can't go through the regular per-request `supabase` client above --
    // and since it's a soft ranking nudge, not correctness-critical, a
    // missing SUPABASE_SERVICE_ROLE_KEY or a slow/failed read just means
    // no freshness penalty this request rather than blocking the page.
    (() => {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return Promise.resolve({ data: [] as { title_id: string }[] | null, error: null });
      }
      const p = Promise.resolve(
        createServiceRoleClient()
          .from("recommendation_impressions")
          .select("title_id")
          .eq("user_id", userId)
          .eq("source", source)
          .order("served_at", { ascending: false })
          .limit(limit * RECENT_IMPRESSION_LOOKBACK_VISITS)
      );
      return withTimeout(
        p,
        2000,
        { data: [] as Awaited<typeof p>["data"], error: null } as Awaited<typeof p>,
        markDegraded("recent-impressions-freshness")
      );
    })(),
  ]);

  const recentlyShownTitleIds = new Set((recentImpressions ?? []).map((r) => r.title_id));

  const genresByRatedTitleId = new Map((ratedTitleGenres ?? []).map((t) => [t.id, t.genres]));
  const releaseDateByRatedTitleId = new Map((ratedTitleGenres ?? []).map((t) => [t.id, t.release_date]));
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
      genres: (f.titles as unknown as { genres: string[] | null; release_date: string | null } | null)?.genres ?? null,
      releaseDate:
        (f.titles as unknown as { genres: string[] | null; release_date: string | null } | null)?.release_date ?? null,
    }));
  const reviewedGenreInputs = (reviewedTitlesForAffinity ?? [])
    .filter((rv) => !ratedTitleIdSet.has(rv.title_id) && rv.inferred_score != null)
    .map((rv) => ({
      score: rv.inferred_score as number,
      genres: (rv.titles as unknown as { genres: string[] | null; release_date: string | null } | null)?.genres ?? null,
      releaseDate:
        (rv.titles as unknown as { genres: string[] | null; release_date: string | null } | null)?.release_date ?? null,
    }));
  const genreAffinity = computeGenreAffinity([
    ...(userRatings ?? []).map((r) => ({ score: r.score, genres: genresByRatedTitleId.get(r.title_id) ?? null })),
    ...favoriteGenreInputs,
    ...reviewedGenreInputs,
  ]);
  // Recommendation intelligence audit follow-up: "decades" was a checklist
  // signal with zero code path into scoring (see
  // recommendation-signal-and-problem-audit.md) despite release_date
  // existing on every title already fetched here. Deliberately reuses the
  // exact same three input sources (ratings/favorites/reviews) as
  // genre-affinity above -- same "what counts as this user's taste"
  // definition, just bucketed by decade instead of genre. See
  // decade-affinity.ts for why this is capped much lighter than genre.
  const decadeAffinity = computeDecadeAffinity([
    ...(userRatings ?? []).map((r) => ({
      score: r.score,
      releaseDate: releaseDateByRatedTitleId.get(r.title_id) ?? null,
    })),
    ...favoriteGenreInputs.map((f) => ({ score: f.score, releaseDate: f.releaseDate })),
    ...reviewedGenreInputs.map((rv) => ({ score: rv.score, releaseDate: rv.releaseDate })),
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
  // Resolved as late as possible -- see the `weather` param's doc comment
  // above for why this can be a still-in-flight Promise at this point.
  const resolvedWeather = weather ? await weather : null;
  const { min: MIN_TOTAL_ADJUSTMENT, max: MAX_TOTAL_ADJUSTMENT } = computeAdjustmentBand(confidence);
  const adjusted: { id: string; score: number }[] = [];
  for (const [id, score] of blended.entries()) {
    const title = byId.get(id);
    if (!title) continue;
    const contextMult = context ? contextMultiplier(title, context) : 1;
    if (contextMult === null) continue; // hard-excluded by this context (e.g. too long for something_short)
    // "Only highly rated movies should be recommended" -- a hard floor, not
    // just the softer qualityMult nudge below. See passesQualityFloor's doc
    // comment: a strong enough taste-fit (e.g. Death Wish 2018's 0.785
    // content similarity) could previously outrun even a 0.6x quality
    // multiplier and still surface. This can't happen anymore.
    // Recommendation intelligence audit finding #3: pass this user's own
    // curation confidence through so a deeply-curated account gets a
    // little real room in genuinely niche-but-legible-taste territory
    // (see quality-weighting.ts's computeQualityFloor doc comment) instead
    // of the exact same unconditional 7.0 bar as a brand-new signup.
    if (!passesQualityFloor(title.weighted_rating, title.rt_critic_score, confidence)) continue;
    // Weather/time is a soft nudge layered on top of the (also soft, except
    // for something_short) context multiplier — see weather-time-weighting.ts
    // for why this is never a hard exclusion.
    const weatherMult = resolvedWeather ? weatherTimeMultiplier(title, resolvedWeather) : 1;
    const qualityMult = qualityMultiplier(title.weighted_rating, title.rt_critic_score);
    const genreMult = genreAffinityMultiplier(title.genres, genreAffinity);
    const decadeMult = decadeAffinityMultiplier(title.release_date, decadeAffinity);
    const dislikeMult = dislikePenaltyMultiplier(dislikeSimilarityById.get(id) ?? 0, CONTENT_MATCH_THRESHOLD);
    const implicitMult = implicitAffinityMultiplier(
      implicitWatchlistSimilarityById.get(id) ?? 0,
      implicitWatchedUnratedSimilarityById.get(id) ?? 0,
      CONTENT_MATCH_THRESHOLD,
      confidence
    );
    // Recommendation intelligence audit finding #4 -- see
    // RECENT_IMPRESSION_LOOKBACK_VISITS's doc comment above.
    const freshnessMult = recentlyShownTitleIds.has(id) ? RECENT_IMPRESSION_PENALTY_MULTIPLIER : 1;
    const nonContextDelta =
      (weatherMult - 1) +
      (qualityMult - 1) +
      (genreMult - 1) +
      (decadeMult - 1) +
      (dislikeMult - 1) +
      (implicitMult - 1) +
      (freshnessMult - 1);
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

  // Recommendation intelligence audit finding #2: swap the weakest-scoring
  // diversified slot for something genuinely outside this user's usual
  // genres, if one exists in the candidate pool (see exploration.ts).
  // Skipped for slates too short to have a principled "weakest" slot to
  // give up -- a single-pick surface (the widget's daily pick) should
  // always be the best exploit match, not a deliberately different one.
  let explorationTitleId: string | null = null;
  let explorationUsualGenres: string[] = [];
  if (rankedIds.length >= 3) {
    const ratedGenreLists = (userRatings ?? []).map((r) => genresByRatedTitleId.get(r.title_id) ?? null);
    const dominantGenres = computeDominantGenres(ratedGenreLists);
    const explorationCandidates: ExplorationCandidate[] = sortedAdjusted.map((a) => ({
      id: a.id,
      score: a.score,
      genres: byId.get(a.id)?.genres ?? null,
    }));
    const exploration = pickExplorationCandidate(explorationCandidates, dominantGenres, new Set(rankedIds));
    if (exploration) {
      rankedIds[rankedIds.length - 1] = exploration.id;
      explorationTitleId = exploration.id;
      explorationUsualGenres = [...dominantGenres];
    }
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
    //
    // This was the last unbounded embedding-similarity RPC left on the home
    // page's critical path -- unlike the others above, it runs sequentially
    // AFTER both Promise.all batches (it needs rankedIds, which needs
    // everything before it), so a slow response here couldn't hide behind
    // anything else running concurrently -- it was pure added latency on
    // top of whatever match_titles_for_user/similarity_to_* already cost.
    // Same cap-and-degrade treatment: past 3s this just contributes no
    // citations ("Because you loved X") rather than blocking the page --
    // recommendation-reveal.tsx already treats citations as optional.
    const citationPromise = Promise.resolve(
      supabase.rpc("most_similar_liked_titles_batch", {
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
      })
    );
    const { data: citationRows } = await withTimeout(
      citationPromise,
      3000,
      { data: [] as Awaited<typeof citationPromise>["data"], error: null } as Awaited<typeof citationPromise>,
      markDegraded("most_similar_liked_titles_batch")
    );
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
    const isExploration = id === explorationTitleId;
    // Recommendation intelligence audit finding #2: the exploration slot
    // gets its own honest explanation builder instead of buildReasonDetail
    // -- it was deliberately picked for NOT matching this user's usual
    // pattern, so running it through the normal "why this matches you"
    // copy would either produce a weak/generic headline or, worse, quietly
    // overstate how well it fits. See buildExplorationDetail in explain.ts.
    const detail = isExploration
      ? buildExplorationDetail(title, explorationUsualGenres)
      : buildReasonDetail({
          title,
          hasStrongContentMatch: (matchFlags.get(id) ?? { hasStrongContentMatch: false }).hasStrongContentMatch,
          citedTitles: citedTitleNamesByRecId.get(id) ?? [],
          context,
          weatherNote: resolvedWeather ? weatherTimeNote(title, resolvedWeather) : null,
          // Specific, better explanations: name the actual affinity signals
          // that were true for this pick instead of only ever citing a
          // specific title or falling back to a generic "Taste Graph"
          // line. Both reuse data already computed above -- no new
          // queries, and both are additive-only (a note this candidate
          // doesn't clear the threshold for is simply omitted, never
          // invented). Skipped for the exploration slot on purpose --
          // that pick was deliberately chosen for NOT matching genre
          // affinity, so a genre note there would contradict its own
          // honest framing (see buildExplorationDetail).
          genreNote: genreAffinityNote(title.genres, genreAffinity),
          decadeNote: decadeAffinityNote(title.release_date, decadeAffinity),
        });
    return {
      title,
      score: adjustedScoreById.get(id) ?? 0,
      reason: detail.headline,
      detail,
      matchPercent: matchPercents[i],
      director: directorNameByTitle.get(id) ?? null,
      isExploration,
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
  // Same hard "only highly rated" floor as the warm-start path -- see
  // passesQualityFloor's doc comment. Cold start has no rt_critic_score
  // blending available here (a single DB query can't easily replicate that
  // blend), but weighted_rating alone at this bar is still a real quality
  // gate, not just an ordering preference.
  const { data: titles } = await supabase
    .from("titles")
    .select("*")
    .eq("type", mediaType)
    .gte("weighted_rating", MIN_RECOMMENDABLE_RATING)
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
