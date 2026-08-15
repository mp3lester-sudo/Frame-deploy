import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { buildReasonDetail, type ExplainableTitle, type ReasonDetail } from "@/lib/recommendations/explain";
import type { MediaType } from "@/lib/context/media-type-cookie";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export interface SignaturePick {
  title: Title;
  /** 80-99 display percentage -- see signatureMatchPercent for why this
   *  uses its own calibration band rather than match-percent.ts's, which
   *  is built for normalizing WITHIN a ranked list of several picks, not
   *  a single standalone showcase title. */
  matchPercent: number;
  /** Same shape the home page's hero recommendation uses, so the Taste
   *  DNA page can reuse WhyThisPick's expandable theme/tone chips
   *  instead of duplicating that UI. */
  detail: ReasonDetail;
}

const DISPLAY_FLOOR = 80;
const DISPLAY_CEILING = 99;
/** Matches engine.ts's CONTENT_MATCH_THRESHOLD -- below this, a match isn't
 *  "strong content match" territory anywhere else in the app, so it
 *  shouldn't be crowned someone's taste signature either. */
const SIMILARITY_FLOOR = 0.5;
/** Realistic ceiling for cosine similarity in this embedding space --
 *  titles rarely clear ~0.92 against a real multi-genre taste vector, so
 *  calibrating the display band to that (rather than a theoretical 1.0)
 *  means genuinely excellent matches actually reach the high 90s instead
 *  of clustering in the low 80s. */
const SIMILARITY_CEILING = 0.92;
/** How many of the user's top content matches to pull before filtering --
 *  wide enough that excluding already-rated titles rarely empties the
 *  pool, without over-fetching the whole catalogue for a single pick. */
const CANDIDATE_POOL = 30;

export function signatureMatchPercent(similarity: number): number {
  const clamped = Math.max(SIMILARITY_FLOOR, Math.min(SIMILARITY_CEILING, similarity));
  const normalized = (clamped - SIMILARITY_FLOOR) / (SIMILARITY_CEILING - SIMILARITY_FLOOR);
  return Math.round(DISPLAY_FLOOR + normalized * (DISPLAY_CEILING - DISPLAY_FLOOR));
}

/**
 * Picks the single title that most purely represents someone's taste:
 * highest content-vector similarity, excluding anything they've already
 * rated (this is meant to read as "the film that says the most about
 * you," a discovery, not a callback to something already logged) and
 * anything below the same "strong match" bar the rest of the app uses.
 * Pure + unit-tested; the DB-fetching wrapper is computeSignaturePick
 * below.
 */
export function pickSignatureCandidate(
  candidates: { titleId: string; similarity: number }[],
  ratedTitleIds: Set<string>,
  minSimilarity: number = SIMILARITY_FLOOR
): { titleId: string; similarity: number } | null {
  return pickSignatureCandidates(candidates, ratedTitleIds, 1, minSimilarity)[0] ?? null;
}

/**
 * Same eligibility rules as pickSignatureCandidate (unrated, above the
 * similarity floor) but returns up to `count` candidates ranked
 * highest-first, instead of just the single winner -- backs the Auteur
 * "extended signature picks" perk (task #343): everyone gets the one
 * pickSignatureCandidate would return (count=1 makes the two equivalent,
 * see the array-index unwrap above), Auteur subscribers get several.
 * Array.prototype.sort is a stable sort (guaranteed since ES2019), so two
 * candidates with identical similarity keep their original relative
 * order here exactly as the old best-tracking loop did -- this isn't just
 * a refactor that happens to match, it's relied on by the tests above.
 */
export function pickSignatureCandidates(
  candidates: { titleId: string; similarity: number }[],
  ratedTitleIds: Set<string>,
  count: number,
  minSimilarity: number = SIMILARITY_FLOOR
): { titleId: string; similarity: number }[] {
  return candidates
    .filter((c) => !ratedTitleIds.has(c.titleId) && c.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(0, count));
}

/**
 * Deliberately narrower than getRecommendationsForUser (engine.ts): no
 * collaborative blending, no context/weather/quality nudges -- just raw
 * content-vector similarity to this person's own rating history. The
 * home page's hero recommendation answers "what should you watch right
 * now"; this answers a different question, "what does your taste actually
 * look like distilled into one film," so it deliberately doesn't share
 * that hybrid scoring (and, as a side effect, rarely surfaces the exact
 * same title as today's hero pick).
 */
export async function computeSignaturePick(userId: string, mediaType: MediaType): Promise<SignaturePick | null> {
  const picks = await computeSignaturePicks(userId, 1, mediaType);
  return picks[0] ?? null;
}

/**
 * Same "what does your taste look like distilled into one film" query as
 * computeSignaturePick, but returns up to `count` picks instead of just
 * the top one -- backs the Auteur "extended signature picks" perk (task
 * #343). count=1 (what computeSignaturePick passes) makes the two
 * equivalent to the pre-multi-pick behavior.
 */
export async function computeSignaturePicks(userId: string, count: number, mediaType: MediaType): Promise<SignaturePick[]> {
  const supabase = await createClient();

  const [{ data: matches }, { data: userRatings }] = await Promise.all([
    supabase.rpc("match_titles_for_user", { p_user_id: userId, p_match_count: CANDIDATE_POOL, p_media_type: mediaType }),
    supabase.from("ratings").select("title_id, titles!inner(type)").eq("user_id", userId).eq("titles.type", mediaType),
  ]);

  if (!matches?.length) return [];

  const ratedTitleIds = new Set((userRatings ?? []).map((r) => r.title_id));
  const candidates = matches.map((m) => ({ titleId: m.title_id, similarity: m.similarity }));
  const winners = pickSignatureCandidates(candidates, ratedTitleIds, count);
  if (!winners.length) return [];

  // One winner's title+citations don't depend on another's, so every
  // winner is built in parallel rather than paying for N sequential round
  // trips -- each buildSignaturePick call still has its own unavoidable
  // internal sequential step (cited titles' names depend on citedIds).
  const built = await Promise.all(winners.map((winner) => buildSignaturePick(supabase, userId, winner, mediaType)));
  return built.filter((p): p is SignaturePick => p !== null);
}

async function buildSignaturePick(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  winner: { titleId: string; similarity: number },
  mediaType: MediaType
): Promise<SignaturePick | null> {
  // The title row and its citations don't depend on each other, so fetch
  // both in parallel rather than paying for two sequential round trips --
  // this chain already has one unavoidable sequential step after (cited
  // titles' names depend on citedIds), no need to add a second.
  const [{ data: title }, { data: citationRows }] = await Promise.all([
    supabase.from("titles").select("*").eq("id", winner.titleId).maybeSingle(),
    // Same citation RPC engine.ts uses for "Because you loved X" -- up to
    // two titles from this person's own history that are closest to the
    // pick, in closest-first order.
    supabase.rpc("most_similar_liked_title", {
      p_user_id: userId,
      p_title_id: winner.titleId,
      p_min_similarity: SIMILARITY_FLOOR,
      p_media_type: mediaType,
    }),
  ]);
  if (!title) return null;

  const citedIds = (citationRows ?? []).map((r) => r.title_id).filter((id): id is string => !!id);

  let citedTitles: string[] = [];
  if (citedIds.length) {
    const { data: citedRows } = await supabase.from("titles").select("id, name").in("id", citedIds);
    const nameById = new Map((citedRows ?? []).map((t) => [t.id, t.name]));
    citedTitles = citedIds.map((id) => nameById.get(id)).filter((n): n is string => !!n);
  }

  const detail = buildReasonDetail({
    title: title as ExplainableTitle,
    hasStrongContentMatch: true,
    citedTitles,
  });

  return {
    title,
    matchPercent: signatureMatchPercent(winner.similarity),
    detail,
  };
}
