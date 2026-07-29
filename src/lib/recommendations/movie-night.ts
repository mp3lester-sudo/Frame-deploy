import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { rankGroupCandidates, buildGroupConsensusNote, type ParticipantScores } from "./group-fairness";

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

function firstName(display: string | null | undefined, username: string): string {
  return display?.trim()?.split(/\s+/)[0] || username;
}

/**
 * Group pick for a movie night — finds a genuine "happy medium" rather than
 * just summing/averaging raw content-similarity scores, which can quietly
 * let whoever's taste vector runs "hot" dominate even when the math looks
 * even-handed (see group-fairness.ts's module doc for the full reasoning).
 * Hard rule (product decision): a title never surfaces if it's a clear miss
 * for even one participant, even if the group average looks great —
 * relaxed automatically only if a group's tastes are divergent enough that
 * nothing would otherwise pass at all.
 *
 * Falls back to popularity when nobody in the group has a taste vector yet
 * (cold start / no ratings) — same resilience pattern as the solo engine.
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

  const excludedGenres = new Set(participants.flatMap((p) => p.excluded_genres ?? []));
  const participantNames = new Map(
    participants.map((p) => [p.user_id, firstName(p.profiles?.display_name, p.profiles?.username ?? "someone")])
  );

  // Seed a shared candidate pool from each participant's own top matches —
  // keeps the pool to "things at least someone likes" rather than scoring
  // the entire catalogue for every person. (match_titles_for_user is
  // SECURITY DEFINER as of migration 0023 specifically so this works for
  // every participant, not just whoever's browser session happens to be
  // making the request — see that migration for the RLS bug this fixes.)
  const candidateIds = new Set<string>();
  let anyoneHasMatches = false;
  for (const p of participants) {
    const { data: matches } = await supabase.rpc("match_titles_for_user", {
      p_user_id: p.user_id,
      p_match_count: PER_PARTICIPANT_SEED_COUNT,
      p_exclude_watched: true,
    });
    if (matches?.length) {
      anyoneHasMatches = true;
      for (const m of matches) candidateIds.add(m.title_id);
    }
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
  for (const p of participants) {
    const { data: sims } = await supabase.rpc("title_similarity_for_user", {
      p_user_id: p.user_id,
      p_title_ids: allIds,
    });
    participantScores.push({
      userId: p.user_id,
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
    note: buildGroupConsensusNote(r, participantNames),
  }));
}
