import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { CONTENT_MATCH_THRESHOLD } from "./engine";
import { calibrateMatchPercents } from "./match-percent";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export interface HiddenGem {
  title: Title;
  matchPercent: number;
}

// "Obscure enough to feel like a real find" -- titles above this vote
// count are ones the average person has at least a passing chance of
// already knowing, so they don't clear the bar no matter how good the
// taste match is.
const MAX_VOTE_COUNT = 500;

// Still has to actually be good, not just unheard of. weighted_rating is
// already a Bayesian average (see 0009_weighted_rating.sql) that discounts
// thin vote counts toward the catalogue mean, so requiring a real floor
// here isn't just trusting a 9/10 from three people.
const MIN_WEIGHTED_RATING = 6.5;

const CANDIDATE_POOL_SIZE = 40;

/**
 * A single high-match, low-popularity pick for the home page's Hidden Gem
 * slot (previously Director of the Day) -- same taste vector and RPC used
 * by the main recommendation engine (match_titles_for_user, which already
 * excludes watched titles), just re-ranked for "good AND obscure" instead
 * of "best overall match." excludeIds lets the caller keep this from ever
 * repeating whatever's already shown as the hero pick / mood row.
 *
 * Returns null for cold-start users (no taste vector yet, same as the main
 * engine) or when nothing in the match pool clears both the obscurity and
 * quality bars -- no fallback to a lower bar, since a "hidden gem" that
 * isn't actually either of those things isn't worth showing.
 */
export async function getHiddenGemForUser(userId: string, excludeIds: string[] = []): Promise<HiddenGem | null> {
  const supabase = await createClient();

  const { data: tasteVector } = await supabase
    .from("taste_vectors")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!tasteVector) return null;

  const { data: contentMatches } = await supabase.rpc("match_titles_for_user", {
    p_user_id: userId,
    p_match_count: CANDIDATE_POOL_SIZE,
  });
  if (!contentMatches?.length) return null;

  const excluded = new Set(excludeIds);
  const candidateIds = contentMatches.map((m) => m.title_id).filter((id) => !excluded.has(id));
  if (!candidateIds.length) return null;

  const { data: titles } = await supabase.from("titles").select("*").in("id", candidateIds);
  const byId = new Map((titles ?? []).map((t) => [t.id, t]));
  const similarityById = new Map(contentMatches.map((m) => [m.title_id, m.similarity]));

  const gems = candidateIds
    .map((id) => ({ title: byId.get(id), similarity: similarityById.get(id) ?? 0 }))
    .filter(
      (c): c is { title: Title; similarity: number } =>
        !!c.title &&
        c.similarity >= CONTENT_MATCH_THRESHOLD &&
        (c.title.tmdb_vote_count ?? Infinity) <= MAX_VOTE_COUNT &&
        (c.title.weighted_rating ?? 0) >= MIN_WEIGHTED_RATING
    )
    .sort((a, b) => b.similarity - a.similarity);

  if (!gems.length) return null;

  const best = gems[0];
  const [matchPercent] = calibrateMatchPercents([best.similarity]);
  return { title: best.title, matchPercent };
}
