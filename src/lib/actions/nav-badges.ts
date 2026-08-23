"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getUnreadNotificationCount } from "@/lib/actions/notifications";

/**
 * Unread message + notification counts for the top nav's badge icons --
 * split out of RootLayout's own render path (see layout.tsx) so these
 * don't sit on the critical path of every single navigation across the
 * whole app. This used to be 2-3 DB round trips (conversations lookup,
 * then a conditional messages count, plus the notifications count)
 * awaited inline in the layout that wraps every page, meaning literally
 * every click paid that latency before any page content could even start
 * rendering, regardless of whether the destination page has anything to
 * do with messages or notifications. NavBar now calls this itself, once,
 * client-side, after the page has already painted -- badges pop in a
 * beat later instead of holding the whole page hostage for them.
 */
export async function getNavBadgeCounts(): Promise<{
  unreadMessageCount: number;
  unreadNotificationCount: number;
}> {
  const user = await getVerifiedUser();
  if (!user) return { unreadMessageCount: 0, unreadNotificationCount: 0 };

  const supabase = await createClient();

  const [{ data: conversations }, unreadNotificationCount] = await Promise.all([
    supabase.from("conversations").select("id").or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
    getUnreadNotificationCount(),
  ]);

  const conversationIds = (conversations ?? []).map((c) => c.id);
  let unreadMessageCount = 0;
  if (conversationIds.length) {
    const { count, error: countError } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .in("conversation_id", conversationIds)
      .neq("sender_id", user.id)
      .is("read_at", null);
    if (countError) console.error("[navBadges] unread count", countError.message);
    unreadMessageCount = count ?? 0;
  }

  return { unreadMessageCount, unreadNotificationCount };
}
