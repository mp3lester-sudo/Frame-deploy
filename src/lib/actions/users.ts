"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { PEOPLE_SEARCH_PAGE_SIZE } from "@/lib/constants/social";
import { buildUserSearchFilter } from "@/lib/search/user-search";
import { captureServerError } from "@/lib/monitoring/sentry-server";

export interface UserSearchResult {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  isFollowing: boolean;
}

async function searchUsersPage(rawQuery: string, from: number, to: number) {
  const supabase = await createClient();
  const viewer = await getVerifiedUser();

  const filter = buildUserSearchFilter(rawQuery);
  if (!filter) return { users: [] as UserSearchResult[], hasMore: false };

  let builder = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .or(filter)
    .is("deleted_at", null)
    .order("username")
    .range(from, to);

  if (viewer) builder = builder.neq("id", viewer.id);

  const { data, error } = await builder;
  if (error) {
    // Was previously swallowed silently (destructured `data` only), which
    // made a broken query indistinguishable from "genuinely no matches" in
    // the UI -- surface it so a bad filter/RLS change shows up in Sentry
    // instead of just quietly returning zero results forever.
    await captureServerError(error, { action: "searchUsersPage", query: rawQuery });
    return { users: [], hasMore: false };
  }
  if (!data || data.length === 0) return { users: [], hasMore: false };

  const ids = data.map((p) => p.id);
  const { data: followingRows } = viewer
    ? await supabase.from("follows").select("followee_id").eq("follower_id", viewer.id).in("followee_id", ids)
    : { data: [] };
  const followingSet = new Set((followingRows ?? []).map((f) => f.followee_id));

  const users: UserSearchResult[] = data.map((p) => ({ ...p, isFollowing: followingSet.has(p.id) }));
  return { users, hasMore: data.length === to - from + 1 };
}

export async function searchUsers(query: string): Promise<{ users: UserSearchResult[]; hasMore: boolean }> {
  return searchUsersPage(query, 0, PEOPLE_SEARCH_PAGE_SIZE - 1);
}

export async function loadMoreUserSearch(query: string, page: number) {
  const from = (page - 1) * PEOPLE_SEARCH_PAGE_SIZE;
  const to = from + PEOPLE_SEARCH_PAGE_SIZE - 1;
  return searchUsersPage(query, from, to);
}

/**
 * Auteur tier (see isAuteurActive in lib/premium/tier.ts) is fully built --
 * 13 files already gate real features behind it -- but stays unpurchasable
 * until STRIPE_AUTEUR_PRICE_ID is configured (see premium/page.tsx). Until
 * that's set, PremiumUpgradeCard offers this instead of a dead disabled
 * button, so interested users leave a trail instead of just bouncing at
 * the exact moment they showed purchase intent. Idempotent: calling it
 * again after already joining is a harmless no-op, not an error, so the
 * client doesn't need to track "already joined" state across reloads --
 * it just re-derives it from the returned timestamp.
 */
export async function joinAuteurWaitlist(): Promise<{ requestedAt: string } | { error: string }> {
  const user = await getVerifiedUser();
  if (!user) return { error: "You need to be signed in to join the waitlist." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("profiles")
    .select("auteur_waitlist_requested_at")
    .eq("id", user.id)
    .maybeSingle();
  if (existing?.auteur_waitlist_requested_at) {
    return { requestedAt: existing.auteur_waitlist_requested_at };
  }

  const requestedAt = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ auteur_waitlist_requested_at: requestedAt })
    .eq("id", user.id);

  if (error) {
    await captureServerError(error, { action: "joinAuteurWaitlist", userId: user.id });
    return { error: "Something went wrong -- try again in a moment." };
  }
  return { requestedAt };
}
