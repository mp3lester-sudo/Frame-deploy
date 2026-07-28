import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export interface MovieNightCandidate {
  title: Title;
  score: number;
}

/**
 * Group pick for a movie night: blends every participant's individual
 * content-based matches (match_titles_for_user) so a title that multiple
 * people's Taste Graphs agree on floats to the top, then drops anything in
 * a genre someone in the group has excluded.
 *
 * Falls back to popularity when nobody in the group has a taste vector yet
 * (cold start / no OpenAI embeddings generated) — same resilience pattern
 * as the solo recommendation engine.
 */
export async function getCandidatesForMovieNight(
  movieNightId: string,
  limit = 6
): Promise<MovieNightCandidate[]> {
  const supabase = await createClient();

  const { data: participants } = await supabase
    .from("movie_night_participants")
    .select("user_id, excluded_genres")
    .eq("movie_night_id", movieNightId);
  if (!participants?.length) return [];

  const excludedGenres = new Set(participants.flatMap((p) => p.excluded_genres ?? []));

  const scores = new Map<string, number>();
  let anyoneHasMatches = false;

  for (const p of participants) {
    const { data: matches } = await supabase.rpc("match_titles_for_user", {
      p_user_id: p.user_id,
      p_match_count: 30,
      p_exclude_watched: true,
    });
    if (matches?.length) {
      anyoneHasMatches = true;
      for (const m of matches) {
        scores.set(m.title_id, (scores.get(m.title_id) ?? 0) + m.similarity);
      }
    }
  }

  let rankedIds: string[];
  if (anyoneHasMatches) {
    rankedIds = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  } else {
    const { data: popular } = await supabase
      .from("titles")
      .select("id")
      .order("tmdb_vote_count", { ascending: false })
      .limit(60);
    rankedIds = (popular ?? []).map((t) => t.id);
  }

  if (rankedIds.length === 0) return [];

  const { data: titles } = await supabase.from("titles").select("*").in("id", rankedIds);
  const byId = new Map((titles ?? []).map((t) => [t.id, t]));

  const filtered = rankedIds
    .map((id) => byId.get(id))
    .filter((t): t is Title => !!t)
    .filter((t) => !t.genres?.some((g) => excludedGenres.has(g)));

  return filtered.slice(0, limit).map((title) => ({
    title,
    score: scores.get(title.id) ?? 0,
  }));
}
