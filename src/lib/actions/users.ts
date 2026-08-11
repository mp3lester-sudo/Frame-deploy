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
