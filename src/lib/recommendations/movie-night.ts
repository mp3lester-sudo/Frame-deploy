import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import {
  rankGroupCandidates,
  buildGroupConsensusHeadline,
  type ParticipantScores,
  type ParticipantCitation,
} from "./group-fairness";
import { computeGenreAffinity } from "./genre-affinity";
import { CONTENT_MATCH_THRESHOLD } from "./engine";
import { passesQualityFloor, MIN_RECOMMENDABLE_RATING } from "./quality-weighting";
import type { ReasonDetail } from "./explain";
import { captureServerError } from "@/lib/monitoring/sentry-server";
import type { MediaType } from "@/lib/context/media-type-cookie";

type Title = Database["public"]["Tables"]["titles"]["Row"];
type ParticipantRow = { user_id: string; excluded_genres: string[] | null };

export interface MovieNightCandidate {
  title: Title;
  score: number;
  /** Short, honest line on how this pick fits the group -- now names
   *  specific titles from each person's own rating history when a real
   *  one clears the bar (see buildGroupConsensusHeadline), falling back
   *  to group-fairness.ts's generic buildGroupConsensusNote otherwise. */
  note: string;
  /** Full structured detail -- same shape the solo home page uses (themes,
   *  tone, mood, pacing, ending, cited titles) -- for a "Why this pick"
   *  expansion identical in spirit to the solo engine's. */
  detail: ReasonDetail;
}

/** Plain detail with no citations -- used for the two popularity-fallback
 *  branches below, where there's no personalized signal at all yet. */
function genericDetail(title: Title, headline: string): ReasonDetail {
  const themes = title.themes ?? [];
  const tone = title.tone ?? [];
  const longReason = [
    "There's no personalized signal for the group yet, so this is ranked on general fit rather than anyone's specific ratings.",
    themes.length ? `It's built around ${themes.slice(0, 3).join(", ")}${tone.length ? ` with a ${tone.slice(0, 2).join(" and ")} tone` : ""}.` : null,
  ]
    .filter((s): s is string => !!s)
    .join(" ");
  return {
    headline,
    longReason,
    themes,
    tone,
    moodTags: title.mood_tags ?? [],
    pacing: title.pacing ?? null,
    endingType: title.ending_type ?? null,
    citedTitles: [],
  };
}

/** Multi-sentence expansion for a group pick's "Why this pick" -- built
 *  from the same real signals the short `note` headline draws on (per-
 *  participant citations) plus the title's own themes/tone, framed for a
 *  group rather than a single user. */
function buildGroupLongReason(title: Title, citations: ParticipantCitation[], allCited: string[]): string {
  const themes = title.themes ?? [];
  const tone = title.tone ?? [];
  const sentences: string[] = [];

  if (allCited.length) {
    sentences.push(
      `This was ranked using each participant's own rating history: ${citations
        .filter((c) => c.citedTitles.length)
        .length} of ${citations.length} people have a real close match in their own ratings (${allCited
        .slice(0, 4)
        .join(", ")}), not just a generic group-average guess.`
    );
  } else {
    sentences.push("This is ranked by combining everyone's taste vector, weighted so no single participant's preferences dominate the pick.");
  }
  if (themes.length) {
    sentences.push(`It centers on ${themes.slice(0, 3).join(", ")}${tone.length ? ` with a ${tone.slice(0, 2).join(" and ")} tone` : ""}.`);
  }
  return sentences.join(" ");
}

// How many of each participant's own top matches seed the shared candidate
// pool — kept well above the final `limit` so the fairness pass (which can
// exclude a fair number of candidates via the floor) still has enough left
// to choose from.
const PER_PARTICIPANT_SEED_COUNT = 40;

// Ruling out what the group clearly doesn't want, inferred from ratings —
// not just the manual excluded_genres checklist. Deliberately a HARD cut
// (unlike the soft 0.7x-1.3x nudge genre-affinity applies to solo home-page
// recs): picking one title for two-plus people justifies excluding a genre
// that even one participant has repeatedly rated poorly, rather than
// letting the group average paper over a guaranteed miss for them.
const HARD_DISLIKE_THRESHOLD = -0.5;

export function firstName(display: string | null | undefined, username: string): string {
  return display?.trim()?.split(/\s+/)[0] || username;
}

// Group-recommendation count scales with how many people are actually
// choosing together -- a fixed 6-candidate pool regardless of group size
// meant a 2-person Movie Night saw exactly as many options as a 6-person
// one, which felt arbitrary either way (too many for a quick 1:1 pick, too
// few for a bigger group to find something everyone can agree on). Floor
// of 3 (even a solo host mid-invite gets a real choice, not a single
// forced pick); +1 per person after that so the pool grows with the
// group; capped at 12 so a big group night doesn't turn into an
// overwhelming wall of posters to vote on.
export function candidateLimitForGroupSize(size: number): number {
  return Math.max(3, Math.min(12, size + 1));
}

export interface UserGroupParams {
  userIds: string[];
  /** userId -> first name shown in consensus notes ("Leans toward Eli's
   *  taste..."). Callers own how these are resolved — Movie Night pulls
   *  from `movie_night_participants`' joined profiles, the ad-hoc home-page
   *  companion picker resolves them from whichever usernames were typed in. */
  namesByUserId: Map<string, string>;
  /** Manually-set exclusions (Movie Night's per-participant checklist) —
   *  purely additive with the inferred hard-dislike genres below. Omit for
   *  flows (like the ad-hoc companion picker) with no such checklist. */
  manualExcludedGenres?: Set<string>;
  /** Titles never to surface -- used for the refillable queue (a viewer's
   *  own already-voted titles, plus whatever's already showing on their
   *  screen this session) so "pass" can pull in something genuinely new
   *  instead of risking the same title reappearing. */
  excludeTitleIds?: Set<string>;
  limit?: number;
  /** Movies/Shows toggle state -- same filter as every solo recommendation
   *  surface (see engine.ts), so a shared group pool never mixes movies
   *  and TV for either the seed RPC or the popularity fallbacks below. */
  mediaType: MediaType;
}

/**
 * Core group-blend engine: finds a genuine "happy medium" across whatever
 * set of user ids is passed in, rather than just summing/averaging raw
 * content-similarity scores, which can quietly let whoever's taste vector
 * runs "hot" dominate even when the math looks even-handed (see
 * group-fairness.ts's module doc for the full reasoning). Hard rule
 * (product decision): a title never surfaces if it's a clear miss for even
 * one participant, even if the group average looks great — relaxed
 * automatically only if a group's tastes are divergent enough that nothing
 * would otherwise pass at all.
 *
 * Deliberately participant-agnostic — it doesn't know or care whether the
 * group came from a persisted Movie Night session (movie_night_participants)
 * or an ad-hoc "who am I with tonight" pick on the home page. Both
 * getCandidatesForMovieNight and getCandidatesForCompanionSet below are thin
 * wrappers that resolve their own participant list, then defer here.
 *
 * Falls back to popularity when nobody in the group has a taste vector yet
 * (cold start / no ratings) — same resilience pattern as the solo engine.
 */
export async function getCandidatesForUserGroup({
  userIds,
  namesByUserId,
  manualExcludedGenres,
  excludeTitleIds,
  limit = 6,
  mediaType,
}: UserGroupParams): Promise<MovieNightCandidate[]> {
  const supabase = await createClient();
  if (userIds.length === 0) return [];
  const excludeIds = excludeTitleIds ?? new Set<string>();

  const excludedGenres = new Set(manualExcludedGenres ?? []);

  // Infer additional hard-excludes from each participant's own rating
  // history (ratings are public-read, so this needs no RLS workaround).
  // Union across participants: excludedGenres is a "drop if title has any
  // of these genres" set, so adding one participant's clear dislikes here
  // means nobody in the group sees a pick built around a genre someone
  // else has repeatedly rated badly.
  const { data: groupRatings } = await supabase
    .from("ratings")
    .select("user_id, score, title_id")
    .in("user_id", userIds);
  const ratedTitleIds = [...new Set((groupRatings ?? []).map((r) => r.title_id))];
  const { data: ratedTitles } = ratedTitleIds.length
    ? await supabase.from("titles").select("id, genres").in("id", ratedTitleIds)
    : { data: [] };
  const genresByRatedTitle = new Map((ratedTitles ?? []).map((t) => [t.id, t.genres ?? []]));
  const ratingsByParticipant = new Map<string, { score: number; genres: string[] | null }[]>();
  for (const r of groupRatings ?? []) {
    const list = ratingsByParticipant.get(r.user_id) ?? [];
    list.push({ score: r.score, genres: genresByRatedTitle.get(r.title_id) ?? [] });
    ratingsByParticipant.set(r.user_id, list);
  }
  for (const userId of userIds) {
    const affinity = computeGenreAffinity(ratingsByParticipant.get(userId) ?? []);
    for (const [genre, entry] of affinity) {
      if (entry.affinity <= HARD_DISLIKE_THRESHOLD) excludedGenres.add(genre);
    }
  }

  // Seed a shared candidate pool from each participant's own top matches —
  // keeps the pool to "things at least someone likes" rather than scoring
  // the entire catalogue for every person. (match_titles_for_user is
  // SECURITY DEFINER as of migration 0023 specifically so this works for
  // every participant, not just whoever's browser session happens to be
  // making the request — see that migration for the RLS bug this fixes.)
  //
  // Fired concurrently, not one participant after another -- this is a
  // pgvector ANN search per person, one of the more expensive query shapes
  // in the app, and it used to run as a sequential loop: a 4-person Movie
  // Night paid 4x this RPC's latency back-to-back before the candidate
  // pool even started coming together. Every participant's own seed is
  // independent of everyone else's, so there's nothing to wait on.
  const candidateIds = new Set<string>();
  let anyoneHasMatches = false;
  const seedResults = await Promise.all(
    userIds.map((userId) =>
      supabase
        .rpc("match_titles_for_user", {
          p_user_id: userId,
          p_match_count: PER_PARTICIPANT_SEED_COUNT,
          p_exclude_watched: true,
          p_media_type: mediaType,
        })
        .then((r) => ({ userId, ...r }))
    )
  );
  // An RPC error here used to be silently indistinguishable from "this
  // participant genuinely has no taste vector yet" -- both just left
  // `matches` falsy, so a transient failure (or a real bug) quietly fell
  // through to the same "nobody in the group has rated enough yet"
  // popularity fallback as an honest cold start, with zero signal that
  // anything had actually gone wrong. Logging the error (without blocking
  // the fallback -- a broken seed for one participant shouldn't break the
  // whole group pick) means a real failure is now diagnosable instead of
  // looking identical to expected cold-start behavior.
  for (const { userId, data: matches, error } of seedResults) {
    if (error) {
      void captureServerError(error, { where: "getCandidatesForUserGroup:match_titles_for_user", userId });
      continue;
    }
    if (matches?.length) {
      anyoneHasMatches = true;
      for (const m of matches) candidateIds.add(m.title_id);
    }
  }

  // Belt-and-suspenders watched-exclusion: match_titles_for_user only
  // excludes titles the SEEDING participant watched, so a title one
  // participant already watched can still enter the pool via someone
  // else's seed contribution. This checks the whole seeded pool against
  // every participant's watch history (titles_watched_by_users, migration
  // 0027) and drops anything anyone in the group has already seen.
  if (candidateIds.size > 0) {
    const { data: watched, error: watchedError } = await supabase.rpc("titles_watched_by_users", {
      p_user_ids: userIds,
      p_title_ids: [...candidateIds],
    });
    if (watchedError) void captureServerError(watchedError, { where: "getCandidatesForUserGroup:titles_watched_by_users" });
    for (const w of watched ?? []) candidateIds.delete(w.title_id);
  }
  for (const id of excludeIds) candidateIds.delete(id);

  // "Only highly rated movies should be recommended" -- same hard floor
  // as the solo engine (see quality-weighting.ts), applied here too since
  // this seeded pool skipped it entirely before: nothing stopped a
  // universally-loathed title from winning the group fairness ranking
  // below as long as its content similarity was high enough for everyone.
  if (candidateIds.size > 0) {
    const CHUNK = 100;
    const idsArray = [...candidateIds];
    const qualityById = new Map<string, { weighted_rating: number | null; rt_critic_score: number | null }>();
    for (let i = 0; i < idsArray.length; i += CHUNK) {
      const { data: chunkTitles } = await supabase
        .from("titles")
        .select("id, weighted_rating, rt_critic_score")
        .in("id", idsArray.slice(i, i + CHUNK));
      for (const t of chunkTitles ?? []) qualityById.set(t.id, t);
    }
    for (const id of idsArray) {
      const q = qualityById.get(id);
      if (!q || !passesQualityFloor(q.weighted_rating, q.rt_critic_score)) candidateIds.delete(id);
    }
  }

  if (!anyoneHasMatches) {
    // This exact branch used to be indistinguishable from a real bug --
    // "zero seed matches for every participant" reads identically in the
    // UI whether it's an honest cold start (nobody here has rated any
    // titles of this media type yet) or something actually broken
    // (someone has a real rating history but their taste vector never
    // got built, or the whole vector table is being missed somehow).
    // Checking who actually HAS a taste_vectors row for this media type
    // turns that guess into a fact, logged non-blocking so it doesn't
    // cost this request anything: a participant with a rating history
    // but no vector row (or a vector row that still produced zero
    // matches) points at a real bug worth chasing; everyone missing a
    // row is a genuine cold start and this fallback is doing its job.
    const [{ data: vectorRows }, { data: ratingRows }] = await Promise.all([
      supabase.from("taste_vectors").select("user_id").eq("media_type", mediaType).in("user_id", userIds),
      supabase.from("ratings").select("user_id, title_id").in("user_id", userIds),
    ]);
    const withVector = new Set((vectorRows ?? []).map((v) => v.user_id));
    let ratedThisType = 0;
    if ((ratingRows ?? []).length > 0) {
      const ratedTitleIds = [...new Set((ratingRows ?? []).map((r) => r.title_id))];
      const { data: ratedTypeTitles } = await supabase.from("titles").select("id").eq("type", mediaType).in("id", ratedTitleIds);
      const ratedThisTypeIds = new Set((ratedTypeTitles ?? []).map((t) => t.id));
      ratedThisType = (ratingRows ?? []).filter((r) => ratedThisTypeIds.has(r.title_id)).length;
    }
    const suspicious = withVector.size > 0 || ratedThisType > 0;
    if (suspicious) {
      void captureServerError(new Error("Group blend: zero seed matches despite existing signal"), {
        where: "getCandidatesForUserGroup:anyoneHasMatches",
        mediaType,
        participantCount: userIds.length,
        participantsWithVector: withVector.size,
        ratingsOfThisMediaType: ratedThisType,
      });
    }

    // Same hard "only highly rated" floor as the personalized path above --
    // a popularity fallback shouldn't reintroduce a movie that couldn't
    // clear the quality bar just because it's widely watched.
    const { data: popular } = await supabase
      .from("titles")
      .select("*")
      .eq("type", mediaType)
      .gte("weighted_rating", MIN_RECOMMENDABLE_RATING)
      .order("tmdb_vote_count", { ascending: false })
      .limit(60);
    const excludeFiltered = (popular ?? []).filter((t) => !excludeIds.has(t.id));
    // A group's combined hard dislikes can span most of what's popular right
    // now (e.g. someone hard-dislikes Comedy, someone else hard-dislikes
    // Action) — don't let that genre filter empty the fallback list out from
    // under a group that already has nothing personalized to show them.
    let filtered = excludeFiltered.filter((t) => !t.genres?.some((g) => excludedGenres.has(g)));
    if (filtered.length === 0 && excludeFiltered.length > 0) {
      filtered = excludeFiltered;
    }
    const note = "Popular right now — nobody in the group has rated enough yet to personalize this.";
    return filtered.slice(0, limit).map((title) => ({
      title,
      score: 0,
      note,
      detail: genericDetail(title, note),
    }));
  }

  // Now get every participant's EXACT similarity for the whole shared pool
  // (not just their own top-N) — a fair floor needs apples-to-apples
  // scores, and "absent from someone's top-N" is ambiguous in a way a hard
  // fairness rule can't tolerate guessing at (see title_similarity_for_user,
  // migration 0023).
  const allIds = [...candidateIds];
  // Same fix as the seed step above: this used to be a sequential
  // `for` loop, one round trip per participant, one after another. A
  // full Auteur-tier Watch Party (up to AUTEUR_MOVIE_NIGHT_MAX_PARTICIPANTS
  // people, see premium/tier.ts) paid that RPC's latency up to 24x in a
  // row before ranking could even start. Every participant's exact
  // similarity over the shared pool is independent of everyone else's,
  // so there's nothing here to wait on either.
  const simsResults = await Promise.all(
    userIds.map((userId) =>
      supabase
        .rpc("title_similarity_for_user", {
          p_user_id: userId,
          p_title_ids: allIds,
          p_media_type: mediaType,
        })
        .then((r) => ({ userId, ...r }))
    )
  );
  const participantScores: ParticipantScores[] = simsResults.map(({ userId, data: sims, error: simsError }) => {
    if (simsError) void captureServerError(simsError, { where: "getCandidatesForUserGroup:title_similarity_for_user", userId });
    return {
      userId,
      scores: new Map((sims ?? []).map((s) => [s.title_id, s.similarity])),
    };
  });

  const ranked = rankGroupCandidates(participantScores);
  if (ranked.length === 0) {
    // Every active participant has a taste vector, but none of the seeded
    // candidates were scored for all of them (a very small/mismatched
    // seed pool) — fall back to popularity rather than showing nothing.
    // Same hard "only highly rated" floor as the personalized path above --
    // a popularity fallback shouldn't reintroduce a movie that couldn't
    // clear the quality bar just because it's widely watched.
    const { data: popular } = await supabase
      .from("titles")
      .select("*")
      .eq("type", mediaType)
      .gte("weighted_rating", MIN_RECOMMENDABLE_RATING)
      .order("tmdb_vote_count", { ascending: false })
      .limit(60);
    const excludeFiltered = (popular ?? []).filter((t) => !excludeIds.has(t.id));
    let filtered = excludeFiltered.filter((t) => !t.genres?.some((g) => excludedGenres.has(g)));
    if (filtered.length === 0 && excludeFiltered.length > 0) {
      filtered = excludeFiltered;
    }
    const note = "Popular right now — not enough overlap yet to find a personalized group match.";
    return filtered.slice(0, limit).map((title) => ({
      title,
      score: 0,
      note,
      detail: genericDetail(title, note),
    }));
  }

  const { data: titles } = await supabase.from("titles").select("*").in("id", allIds);
  const byId = new Map((titles ?? []).map((t) => [t.id, t]));

  const rankedWithTitles = ranked
    .map((r) => ({ ...r, title: byId.get(r.titleId) }))
    .filter((r): r is typeof r & { title: Title } => !!r.title)
    .filter((r) => !excludeIds.has(r.title.id));

  // The hard per-genre veto (manual excludes + each participant's own
  // HARD_DISLIKE_THRESHOLD genres, unioned) is meant to steer away from a
  // guaranteed miss for someone -- not to leave the group with nothing at
  // all. With 3-4 people (the "with friends" cap), the union of "someone
  // hard-dislikes this genre" can plausibly cover everything left in a
  // ~80-title seeded pool, silently zeroing out a candidate list that
  // *did* pass the fairness floor -- the exact "AI says there's nothing"
  // dead end this was meant to prevent, not the popularity fallback above
  // (which only fires when nobody has enough rating signal at all). When
  // the veto empties an otherwise-real compromise, fall back to the
  // fairness-ranked list without it rather than showing an empty result
  // for a group that does have a genuine, scored answer.
  let filtered = rankedWithTitles.filter((r) => !r.title.genres?.some((g) => excludedGenres.has(g)));
  if (filtered.length === 0 && rankedWithTitles.length > 0) {
    filtered = rankedWithTitles;
  }

  const topCandidates = filtered.slice(0, limit);

  // Citations ("Alice loved X; Bob loved Y") only computed for the final,
  // already-ranked short list -- one most_similar_liked_title RPC call per
  // (candidate, participant) pair, same "don't pay for what nobody sees"
  // pattern the solo engine uses. Bounded (limit candidates x group size),
  // never the whole seeded candidate pool.
  const citationResults = await Promise.all(
    topCandidates.flatMap((c) =>
      userIds.map((userId) =>
        supabase
          .rpc("most_similar_liked_title", {
            p_user_id: userId,
            p_title_id: c.title.id,
            p_min_similarity: CONTENT_MATCH_THRESHOLD,
            p_media_type: mediaType,
          })
          .then((r) => ({
            titleId: c.title.id,
            userId,
            citedIds: (r.data ?? []).map((row) => row.title_id).filter((cid): cid is string => !!cid),
          }))
      )
    )
  );

  const allCitedIds = new Set<string>();
  for (const { citedIds } of citationResults) for (const cid of citedIds) allCitedIds.add(cid);
  const citedNameById = new Map<string, string>();
  if (allCitedIds.size) {
    const { data: citedTitleRows } = await supabase.from("titles").select("id, name").in("id", [...allCitedIds]);
    for (const row of citedTitleRows ?? []) citedNameById.set(row.id, row.name);
  }

  const citationsByTitleId = new Map<string, ParticipantCitation[]>();
  for (const { titleId, userId, citedIds } of citationResults) {
    const citedTitles = citedIds.map((cid) => citedNameById.get(cid)).filter((n): n is string => !!n);
    const list = citationsByTitleId.get(titleId) ?? [];
    list.push({ userId, citedTitles });
    citationsByTitleId.set(titleId, list);
  }

  return topCandidates.map((r) => {
    const citations = citationsByTitleId.get(r.title.id) ?? [];
    const note = buildGroupConsensusHeadline(r, namesByUserId, citations);
    const allCited = [...new Set(citations.flatMap((c) => c.citedTitles))];
    return {
      title: r.title,
      score: r.averageNormalized,
      note,
      detail: {
        headline: note,
        longReason: buildGroupLongReason(r.title, citations, allCited),
        themes: r.title.themes ?? [],
        tone: r.title.tone ?? [],
        moodTags: r.title.mood_tags ?? [],
        pacing: r.title.pacing ?? null,
        endingType: r.title.ending_type ?? null,
        citedTitles: allCited,
      },
    };
  });
}

/**
 * Group pick for a Movie Night — a persisted session with invited
 * participants (movie_night_participants). Resolves that session's roster
 * and its per-participant excluded_genres checklist, then defers to the
 * shared getCandidatesForUserGroup engine above.
 */
export interface MovieNightCandidateOptions {
  limit?: number;
  /** Movies/Shows toggle state -- see UserGroupParams.mediaType. */
  mediaType: MediaType;
  /** The person this list is being generated for. When set, anything
   *  they've already voted on (like OR pass) is auto-excluded -- nobody
   *  should have to look at a card they've already decided on, whether
   *  that's a stale grid slot from before a page reload or a refill
   *  request mid-session. Other participants' votes don't affect this;
   *  each person's queue is their own. */
  viewerId?: string;
  /** Extra titles to exclude beyond the viewer's own vote history --
   *  the refillable queue uses this for whatever's already occupying
   *  other grid slots on the client this session, so a single refill
   *  request can't hand back a duplicate of a card already showing. */
  excludeTitleIds?: string[];
}

export async function getCandidatesForMovieNight(
  movieNightId: string,
  options: MovieNightCandidateOptions
): Promise<MovieNightCandidate[]> {
  const { limit, viewerId, excludeTitleIds, mediaType } = options;
  const supabase = await createClient();

  const { data: participantRows } = await supabase
    .from("movie_night_participants")
    .select("user_id, excluded_genres, profiles(username, display_name)")
    .eq("movie_night_id", movieNightId);
  if (!participantRows?.length) return [];

  const participants = participantRows as unknown as (ParticipantRow & {
    profiles: { username: string; display_name: string | null } | null;
  })[];

  const namesByUserId = new Map(
    participants.map((p) => [p.user_id, firstName(p.profiles?.display_name, p.profiles?.username ?? "someone")])
  );
  const manualExcludedGenres = new Set(participants.flatMap((p) => p.excluded_genres ?? []));

  const excludeIds = new Set(excludeTitleIds ?? []);
  if (viewerId) {
    const { data: ownVotes } = await supabase
      .from("movie_night_votes")
      .select("title_id")
      .eq("movie_night_id", movieNightId)
      .eq("user_id", viewerId);
    for (const v of ownVotes ?? []) excludeIds.add(v.title_id);
  }

  return getCandidatesForUserGroup({
    userIds: participants.map((p) => p.user_id),
    namesByUserId,
    manualExcludedGenres,
    excludeTitleIds: excludeIds,
    limit: limit ?? candidateLimitForGroupSize(participants.length),
    mediaType,
  });
}

/**
 * Group pick for the home page's ad-hoc "Date night" / "With friends"
 * companion picker — no persisted session, just whichever real Marquee
 * users were picked just now (see src/lib/actions/companion-recommendations.ts
 * for how usernames get resolved into ids + names before calling this).
 * Same strict fairness rule as Movie Night: nobody sees a pick that's a
 * clear miss for anyone in the room, even if it's a great match for
 * everyone else.
 */
export async function getCandidatesForCompanionSet(
  userIds: string[],
  namesByUserId: Map<string, string>,
  mediaType: MediaType,
  limit?: number
): Promise<MovieNightCandidate[]> {
  return getCandidatesForUserGroup({
    userIds,
    namesByUserId,
    limit: limit ?? candidateLimitForGroupSize(userIds.length),
    mediaType,
  });
}
