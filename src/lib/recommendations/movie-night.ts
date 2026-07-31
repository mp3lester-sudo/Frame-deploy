import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { rankGroupCandidates, buildGroupConsensusNote, type ParticipantScores } from "./group-fairness";
import { computeGenreAffinity } from "./genre-affinity";

type Title = Database["public"]["Tables"]["titles"]["Row"];
type ParticipantRow = { user_id: string; excluded_genres: string[] | null };

export interface MovieNightCandidate {
  title: Title;
  score: number;
  /** Short, honest line on how this pick fits the group — see
   *  group-fairness.ts's buildGroupConsensusNote. */
  note: string;
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
  limit?: number;
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
  limit = 6,
}: UserGroupParams): Promise<MovieNightCandidate[]> {
  const supabase = await createClient();
  if (userIds.length === 0) return [];

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
  const candidateIds = new Set<string>();
  let anyoneHasMatches = false;
  for (const userId of userIds) {
    const { data: matches } = await supabase.rpc("match_titles_for_user", {
      p_user_id: userId,
      p_match_count: PER_PARTICIPANT_SEED_COUNT,
      p_exclude_watched: true,
    });
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
    const { data: watched } = await supabase.rpc("titles_watched_by_users", {
      p_user_ids: userIds,
      p_title_ids: [...candidateIds],
    });
    for (const w of watched ?? []) candidateIds.delete(w.title_id);
  }

  if (!anyoneHasMatches) {
    const { data: popular } = await supabase
      .from("titles")
      .select("*")
      .order("tmdb_vote_count", { ascending: false })
      .limit(60);
    const filtered = (popular ?? []).filter((t) => !t.genres?.some((g) => excludedGenres.has(g)));
    return filtered.slice(0, limit).map((title) => ({
      title,
      score: 0,
      note: "Popular right now — nobody in the group has rated enough yet to personalize this.",
    }));
  }

  // Now get every participant's EXACT similarity for the whole shared pool
  // (not just their own top-N) — a fair floor needs apples-to-apples
  // scores, and "absent from someone's top-N" is ambiguous in a way a hard
  // fairness rule can't tolerate guessing at (see title_similarity_for_user,
  // migration 0023).
  const allIds = [...candidateIds];
  const participantScores: ParticipantScores[] = [];
  for (const userId of userIds) {
    const { data: sims } = await supabase.rpc("title_similarity_for_user", {
      p_user_id: userId,
      p_title_ids: allIds,
    });
    participantScores.push({
      userId,
      scores: new Map((sims ?? []).map((s) => [s.title_id, s.similarity])),
    });
  }

  const ranked = rankGroupCandidates(participantScores);
  if (ranked.length === 0) {
    // Every active participant has a taste vector, but none of the seeded
    // candidates were scored for all of them (a very small/mismatched
    // seed pool) — fall back to popularity rather than showing nothing.
    const { data: popular } = await supabase
      .from("titles")
      .select("*")
      .order("tmdb_vote_count", { ascending: false })
      .limit(60);
    const filtered = (popular ?? []).filter((t) => !t.genres?.some((g) => excludedGenres.has(g)));
    return filtered.slice(0, limit).map((title) => ({
      title,
      score: 0,
      note: "Popular right now — not enough overlap yet to find a personalized group match.",
    }));
  }

  const { data: titles } = await supabase.from("titles").select("*").in("id", allIds);
  const byId = new Map((titles ?? []).map((t) => [t.id, t]));

  const filtered = ranked
    .map((r) => ({ ...r, title: byId.get(r.titleId) }))
    .filter((r): r is typeof r & { title: Title } => !!r.title)
    .filter((r) => !r.title.genres?.some((g) => excludedGenres.has(g)));

  return filtered.slice(0, limit).map((r) => ({
    title: r.title,
    score: r.averageNormalized,
    note: buildGroupConsensusNote(r, namesByUserId),
  }));
}

/**
 * Group pick for a Movie Night — a persisted session with invited
 * participants (movie_night_participants). Resolves that session's roster
 * and its per-participant excluded_genres checklist, then defers to the
 * shared getCandidatesForUserGroup engine above.
 */
export async function getCandidatesForMovieNight(
  movieNightId: string,
  limit = 6
): Promise<MovieNightCandidate[]> {
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

  return getCandidatesForUserGroup({
    userIds: participants.map((p) => p.user_id),
    namesByUserId,
    manualExcludedGenres,
    limit,
  });
}

/**
 * Group pick for the home page's ad-hoc "Date night" / "With friends"
 * companion picker — no persisted session, just whichever real Backlot
 * users were picked just now (see src/lib/actions/companion-recommendations.ts
 * for how usernames get resolved into ids + names before calling this).
 * Same strict fairness rule as Movie Night: nobody sees a pick that's a
 * clear miss for anyone in the room, even if it's a great match for
 * everyone else.
 */
export async function getCandidatesForCompanionSet(
  userIds: string[],
  namesByUserId: Map<string, string>,
  limit = 6
): Promise<MovieNightCandidate[]> {
  return getCandidatesForUserGroup({ userIds, namesByUserId, limit });
}
