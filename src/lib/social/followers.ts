import { createClient } from "@/lib/supabase/server";

export interface FollowerAvatar {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Most recent followers of `userId` -- built for lightweight social-proof
 * UI (the home page's Movie Night bar avatar stack), NOT a full followers
 * list/page, so this only ever fetches a handful and doesn't paginate.
 * Two-step query (follows, then profiles by id) rather than an embedded
 * select: follows has two FKs into profiles (follower_id and followee_id),
 * so `profiles(...)` on this table is ambiguous without naming the exact
 * constraint, and nothing else in the codebase relies on guessing that
 * name -- every other follows-adjacent query (see taste-twin.ts,
 * friend-loved-this.ts) does the same two-step instead.
 *
 * Ordered most-recently-followed first, so a brand new follower shows up
 * in the stack right away instead of being buried behind whoever followed
 * first.
 */
export async function getRecentFollowers(userId: string, limit = 6): Promise<FollowerAvatar[]> {
  const supabase = await createClient();

  const { data: followRows, error: followError } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("followee_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (followError) {
    console.error("[getRecentFollowers] follows lookup", followError.message);
    return [];
  }
  if (!followRows?.length) return [];

  const followerIds = followRows.map((r) => r.follower_id);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", followerIds);
  if (profilesError) {
    console.error("[getRecentFollowers] profiles lookup", profilesError.message);
    return [];
  }

  // Supabase's .in() doesn't preserve the input order, so re-sort against
  // followerIds (already most-recent-first) rather than trusting the
  // profiles query's own order.
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return followerIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ id: p.id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url }));
}
