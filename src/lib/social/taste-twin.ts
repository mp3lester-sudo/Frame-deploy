import "server-only";
import { createClient } from "@/lib/supabase/server";
import { computeCompatibilityForUsers } from "@/lib/matchmaking/compute";

/**
 * Taste Twin (magic-moments audit, task #754) -- "you and X agree more than
 * anyone else you follow." Two privacy gates, both required before any
 * compatibility number is ever computed or shown:
 *
 *   1. The viewer must have opted in (profiles.taste_twin_opt_in).
 *   2. The candidate must have opted in too -- being someone's mutual
 *      follow doesn't by itself consent to being surfaced as their "taste
 *      twin." Movie Night and profile-page compatibility already compute
 *      pairwise scores between any two users without either opting in
 *      (see compute.ts), but those are both-parties-present, in-the-moment
 *      comparisons the viewer explicitly asked for. This one runs
 *      unprompted and puts a number in front of the viewer about someone
 *      who isn't there -- so both sides need to have said yes.
 *
 * Candidate pool is capped at 15 mutual follows to bound the pairwise
 * compute.ts calls (each does its own set of queries) -- opted-in accounts
 * with a large mutual-follow graph still only ever cost a bounded amount
 * of work, and only on the (at most once/24h) cache-miss path.
 */

const CACHE_TTL_HOURS = 24;
const TASTE_TWIN_THRESHOLD = 85;
const MAX_CANDIDATES = 15;

export interface TasteTwinResult {
  twinUserId: string;
  twinUsername: string;
  twinName: string;
  twinAvatarUrl: string | null;
  percent: number;
  sharedFavoriteGenres: string[];
}

/** Pure: mutual follows = I follow them AND they follow me back. */
export function intersectMutualFollows(followingIds: string[], followerIds: string[]): string[] {
  const followerSet = new Set(followerIds);
  return [...new Set(followingIds)].filter((id) => followerSet.has(id));
}

async function getMutualFollowIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string[]> {
  const [{ data: following }, { data: followers }] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
    supabase.from("follows").select("follower_id").eq("followee_id", userId),
  ]);
  return intersectMutualFollows(
    (following ?? []).map((f) => f.followee_id),
    (followers ?? []).map((f) => f.follower_id)
  );
}

export interface TasteTwinCandidate {
  id: string;
  percent: number;
  hasEnoughData: boolean;
  sharedFavoriteGenres: string[];
}

/**
 * Pure: pick the highest-compatibility candidate that clears both the
 * data-sufficiency bar (same hasEnoughData compute.ts already gates on)
 * and the >=85% Taste Twin bar -- a near-miss isn't a "twin," it's just
 * a decent Movie Night match, which the app already surfaces elsewhere.
 */
export function pickBestTasteTwin(
  candidates: TasteTwinCandidate[],
  threshold: number = TASTE_TWIN_THRESHOLD
): TasteTwinCandidate | null {
  let best: TasteTwinCandidate | null = null;
  for (const candidate of candidates) {
    if (!candidate.hasEnoughData) continue;
    if (candidate.percent < threshold) continue;
    if (!best || candidate.percent > best.percent) best = candidate;
  }
  return best;
}

export async function getTasteTwin(userId: string): Promise<TasteTwinResult | null> {
  const supabase = await createClient();

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("taste_twin_opt_in")
    .eq("id", userId)
    .maybeSingle();
  if (!viewerProfile?.taste_twin_opt_in) return null;

  const { data: cached } = await supabase
    .from("taste_twin_cache")
    .select("twin_user_id, percent, shared_favorite_genres, computed_at")
    .eq("user_id", userId)
    .maybeSingle();

  const cacheIsFresh =
    !!cached && Date.now() - new Date(cached.computed_at).getTime() < CACHE_TTL_HOURS * 60 * 60 * 1000;

  let twinUserId: string | null;
  let percent: number | null;
  let sharedFavoriteGenres: string[];

  if (cacheIsFresh) {
    twinUserId = cached.twin_user_id;
    percent = cached.percent;
    sharedFavoriteGenres = cached.shared_favorite_genres ?? [];
  } else {
    const mutualIds = await getMutualFollowIds(supabase, userId);
    const candidateIds = mutualIds.slice(0, MAX_CANDIDATES);

    let optedInCandidateIds: string[] = [];
    if (candidateIds.length > 0) {
      const { data: candidateProfiles } = await supabase
        .from("profiles")
        .select("id")
        .in("id", candidateIds)
        .eq("taste_twin_opt_in", true);
      optedInCandidateIds = (candidateProfiles ?? []).map((p) => p.id);
    }

    const candidates: TasteTwinCandidate[] = await Promise.all(
      optedInCandidateIds.map(async (candidateId) => {
        const compatibility = await computeCompatibilityForUsers(userId, candidateId, "movie");
        return {
          id: candidateId,
          percent: compatibility.percent,
          hasEnoughData: compatibility.hasEnoughData,
          sharedFavoriteGenres: compatibility.sharedFavoriteGenres,
        };
      })
    );
    const best = pickBestTasteTwin(candidates);

    twinUserId = best?.id ?? null;
    percent = best?.percent ?? null;
    sharedFavoriteGenres = best?.sharedFavoriteGenres ?? [];

    await supabase.from("taste_twin_cache").upsert({
      user_id: userId,
      twin_user_id: twinUserId,
      percent,
      shared_favorite_genres: sharedFavoriteGenres,
      computed_at: new Date().toISOString(),
    });
  }

  if (!twinUserId || percent === null) return null;

  const { data: twinProfile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_url")
    .eq("id", twinUserId)
    .maybeSingle();
  if (!twinProfile) return null;

  return {
    twinUserId,
    twinUsername: twinProfile.username,
    twinName: twinProfile.display_name?.trim() || twinProfile.username || "a friend",
    twinAvatarUrl: twinProfile.avatar_url,
    percent,
    sharedFavoriteGenres,
  };
}
