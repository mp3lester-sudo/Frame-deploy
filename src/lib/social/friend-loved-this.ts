import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * "X loved this too" (magic-moments audit, task #755) -- on a title page,
 * surface a friend you follow who rated it highly. Reuses data the app
 * already has: the follows graph, ratings, and (optionally) a review body
 * if that same person wrote one -- no new signal, no compatibility math,
 * just "someone whose taste you already chose to follow felt strongly
 * about this specific title." No opt-in gate needed here the way Taste
 * Twin needs one: following someone is itself the consent to see their
 * public ratings and reviews next to titles, which the profile/reviews
 * pages already show unconditionally.
 */

const LOVED_SCORE_THRESHOLD = 4;
const REVIEW_EXCERPT_MAX_LENGTH = 140;

export interface FriendRatingCandidate {
  userId: string;
  score: number;
  ratedAt: string;
}

/**
 * Pure: pick the friend rating to highlight. Highest score first (a 5
 * says more than a 4), most recent as the tiebreaker (freshest opinion).
 */
export function pickFriendHighlight(candidates: FriendRatingCandidate[]): FriendRatingCandidate | null {
  const qualifying = candidates.filter((c) => c.score >= LOVED_SCORE_THRESHOLD);
  if (qualifying.length === 0) return null;
  return [...qualifying].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime();
  })[0];
}

/** Pure: trims a review body to a short excerpt without cutting mid-word. */
export function excerptReview(body: string, maxLength: number = REVIEW_EXCERPT_MAX_LENGTH): string {
  const trimmed = body.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

export interface FriendLovedThisResult {
  userId: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  score: number;
  reviewExcerpt: string | null;
}

export async function getFriendLovedThis(viewerId: string, titleId: string): Promise<FriendLovedThisResult | null> {
  const supabase = await createClient();

  const { data: followRows } = await supabase.from("follows").select("followee_id").eq("follower_id", viewerId);
  const followeeIds = (followRows ?? []).map((f) => f.followee_id);
  if (followeeIds.length === 0) return null;

  const { data: ratingRows } = await supabase
    .from("ratings")
    .select("user_id, score, rated_at")
    .eq("title_id", titleId)
    .in("user_id", followeeIds);

  const candidates: FriendRatingCandidate[] = (ratingRows ?? []).map((r) => ({
    userId: r.user_id,
    score: r.score,
    ratedAt: r.rated_at ?? new Date(0).toISOString(),
  }));
  const best = pickFriendHighlight(candidates);
  if (!best) return null;

  const [{ data: friendProfile }, { data: friendReview }] = await Promise.all([
    supabase.from("profiles").select("username, display_name, avatar_url").eq("id", best.userId).maybeSingle(),
    supabase.from("reviews").select("body").eq("user_id", best.userId).eq("title_id", titleId).maybeSingle(),
  ]);
  if (!friendProfile) return null;

  return {
    userId: best.userId,
    username: friendProfile.username,
    name: friendProfile.display_name?.trim() || friendProfile.username,
    avatarUrl: friendProfile.avatar_url,
    score: best.score,
    reviewExcerpt: friendReview?.body ? excerptReview(friendReview.body) : null,
  };
}
