import { createClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/with-timeout";
import type { Database } from "@/lib/supabase/types";
import type { MediaType } from "@/lib/context/media-type-cookie";
import { CONTENT_MATCH_THRESHOLD } from "./engine";
import { calibrateMatchPercents } from "./match-percent";
import { passesQualityFloor } from "./quality-weighting";

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
export async function getHiddenGemForUser(
  userId: string,
  mediaType: MediaType,
  excludeIds: string[] = []
): Promise<HiddenGem | null> {
  const supabase = await createClient();

  const { data: tasteVector } = await supabase
    .from("taste_vectors")
    .select("user_id")
    .eq("user_id", userId)
    .eq("media_type", mediaType)
    .maybeSingle();
  if (!tasteVector) return null;

  // Same unbounded-worst-case RPC as the main engine (see engine.ts's
  // MATCH_TITLES_TIMEOUT_MS comment) -- this card is a nice-to-have
  // addition below the home page's hero pick, not something worth making
  // a visitor wait several extra seconds for, so it degrades to "no
  // hidden gem this load" past the cap rather than blocking the page.
  const contentMatchesPromise = Promise.resolve(supabase.rpc("match_titles_for_user", {
    p_user_id: userId,
    p_match_count: CANDIDATE_POOL_SIZE,
    p_media_type: mediaType,
  }));
  const { data: contentMatches } = await withTimeout(contentMatchesPromise, 4000, {
    data: [] as Awaited<typeof contentMatchesPromise>["data"],
    error: null,
  } as Awaited<typeof contentMatchesPromise>);
  if (!contentMatches?.length) return null;

  const excluded = new Set(excludeIds);
  const candidateIds = contentMatches.map((m) => m.title_id).filter((id) => !excluded.has(id));
  if (!candidateIds.length) return null;

  const { data: titles } = await supabase.from("titles").select("*").in("id", candidateIds).eq("type", mediaType);
  const byId = new Map((titles ?? []).map((t) => [t.id, t]));
  const similarityById = new Map(contentMatches.map((m) => [m.title_id, m.similarity]));

  const gems = candidateIds
    .map((id) => ({ title: byId.get(id), similarity: similarityById.get(id) ?? 0 }))
    .filter(
      (c): c is { title: Title; similarity: number } =>
        !!c.title &&
        c.similarity >= CONTENT_MATCH_THRESHOLD &&
        (c.title.tmdb_vote_count ?? Infinity) <= MAX_VOTE_COUNT &&
        // Same shared "only highly rated" hard floor as the rest of the
        // app (see quality-weighting.ts) -- this used to be its own
        // looser, weighted_rating-only 6.5 bar, which is now below the
        // app-wide 7.0 standard.
        passesQualityFloor(c.title.weighted_rating, c.title.rt_critic_score)
    )
    .sort((a, b) => b.similarity - a.similarity);

  if (!gems.length) return null;

  const best = gems[0];
  // best.similarity is already the raw content similarity -- same number
  // used as both the score to calibrate AND its own confidence anchor,
  // since a hidden gem's only ever one candidate (see match-percent.ts).
  const [matchPercent] = calibrateMatchPercents([best.similarity], best.similarity);
  return { title: best.title, matchPercent };
}
