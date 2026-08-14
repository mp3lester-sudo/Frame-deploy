"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { sendPushToUser } from "@/lib/push/send-push";
import { captureServerError } from "@/lib/monitoring/sentry-server";

export type NotificationType =
  | "follow"
  | "comment"
  | "reaction"
  | "movie_night_invite"
  | "movie_night_decided"
  // System-generated, no human actor -- see the Stripe webhook route,
  // which inserts this type directly (not via notify() below, since
  // notify() always expects an actorId and treats actorId === recipientId
  // as a self-notification no-op).
  | "payment_failed";

/**
 * Shared helper called from the other action files right after the write
 * that should notify someone (toggleFollow in social.ts, addComment in
 * comments.ts, setReviewReaction in reactions.ts, inviteToMovieNight /
 * decideMovieNight in movie-night.ts). Takes the same request-scoped,
 * cookie-authenticated client the calling action already opened via its own
 * requireUser() so the insert runs as the acting user — migration 0031's
 * insert policy requires actor_id = auth.uid().
 *
 * Deliberately best-effort: swallows any failure rather than throwing, so a
 * notification insert glitch can never break the primary action (posting a
 * comment, following someone) that triggered it. Also a no-op if the actor
 * is the recipient — nobody needs to be told they followed themselves.
 *
 * Also fires a Web Push notification (src/lib/push/send-push.ts) to any
 * devices the recipient has subscribed on, alongside the in-app row --
 * every existing call site gets push delivery for free rather than each
 * one having to remember to wire it up separately. The push text needs to
 * be self-contained (unlike the in-app row, which can join against
 * actor/title at read time), so this looks up the actor's name and, for
 * title-attached types, the title's name, before building per-type copy.
 */
export async function notify(
  supabase: SupabaseClient<Database>,
  params: {
    recipientId: string;
    actorId: string;
    type: NotificationType;
    titleId?: string | null;
    refId?: string | null;
  }
) {
  if (params.recipientId === params.actorId) return;
  try {
    const { error } = await supabase.from("notifications").insert({
      recipient_id: params.recipientId,
      actor_id: params.actorId,
      type: params.type,
      title_id: params.titleId ?? null,
      ref_id: params.refId ?? null,
    });
    if (error) throw error;
  } catch (err) {
    // Best-effort — see doc comment above. Still reported to Sentry so a
    // systemic failure (e.g. a bad migration breaking every insert) is
    // visible somewhere instead of just silently dropping notifications
    // for every user, forever.
    await captureServerError(err, { action: "notify.insert", type: params.type, recipientId: params.recipientId });
  }

  try {
    const [{ data: actor }, { data: title }] = await Promise.all([
      supabase.from("profiles").select("username, display_name").eq("id", params.actorId).maybeSingle(),
      params.titleId
        ? supabase.from("titles").select("name").eq("id", params.titleId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const actorName = actor?.display_name ?? actor?.username ?? "Someone";

    let pushTitle = "Backlot";
    let body = "";
    let url = "/notifications";
    switch (params.type) {
      case "follow":
        pushTitle = "New follower";
        body = `${actorName} started following you`;
        url = actor?.username ? `/profile/${actor.username}` : "/notifications";
        break;
      case "comment":
        pushTitle = "New comment";
        body = title?.name ? `${actorName} commented on your review of ${title.name}` : `${actorName} commented on your review`;
        url = params.titleId ? `/movie/${params.titleId}` : "/notifications";
        break;
      case "reaction":
        pushTitle = "New reaction";
        body = title?.name ? `${actorName} reacted to your review of ${title.name}` : `${actorName} reacted to your review`;
        url = params.titleId ? `/movie/${params.titleId}` : "/notifications";
        break;
      case "movie_night_invite":
        pushTitle = "Movie Night";
        body = `${actorName} invited you to a Movie Night`;
        url = params.refId ? `/movie-night/${params.refId}` : "/movie-night";
        break;
      case "movie_night_decided":
        pushTitle = "It's decided";
        body = title?.name ? `Tonight's pick: ${title.name}` : "Your Movie Night has a pick";
        url = params.refId ? `/movie-night/${params.refId}` : "/movie-night";
        break;
    }

    // Per-type opt-out (see migration 0043_notification_preferences.sql) --
    // no row for this (recipient, type) pair means enabled, matching the
    // behavior every existing subscriber already had before this table
    // existed. A lookup failure is treated the same as "no row" (fail
    // open to still-enabled) rather than silently dropping a
    // notification because a preferences query hiccuped. "payment_failed"
    // is never toggled off (it's inserted directly by the Stripe webhook,
    // not via this function, and isn't in the preferences table's check
    // constraint at all) -- TOGGLABLE_TYPES narrows params.type before the
    // query so that stays true at the type level too, not just by
    // convention.
    const TOGGLABLE_TYPES = new Set<NotificationType>([
      "follow",
      "comment",
      "reaction",
      "movie_night_invite",
      "movie_night_decided",
    ]);

    let pushEnabled = true;
    if (TOGGLABLE_TYPES.has(params.type)) {
      const { data: pref } = await supabase
        .from("notification_preferences")
        .select("push_enabled")
        .eq("user_id", params.recipientId)
        .eq(
          "type",
          params.type as "follow" | "comment" | "reaction" | "movie_night_invite" | "movie_night_decided"
        )
        .maybeSingle();
      pushEnabled = pref?.push_enabled !== false;
    }

    if (pushEnabled) {
      await sendPushToUser(params.recipientId, { title: pushTitle, body, url });
    }
  } catch (err) {
    // Best-effort -- a push lookup/send failure should never surface to
    // the caller of notify(), same as the in-app insert above. Still
    // reported to Sentry for the same visibility reason.
    await captureServerError(err, { action: "notify.push", type: params.type, recipientId: params.recipientId });
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  return count ?? 0;
}

/**
 * Called directly from the /notifications page's render (not a form
 * action), so it deliberately does NOT call revalidatePath — Next 16
 * disallows revalidating during a render pass ("Route /notifications used
 * revalidatePath during render"), and it isn't needed here anyway: this
 * route reads cookies for auth (via getVerifiedUser), which already makes
 * it fully dynamic, so every request re-fetches fresh data with no cache
 * to invalidate.
 */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);
}
