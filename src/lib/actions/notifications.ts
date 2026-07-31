"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type NotificationType = "follow" | "comment" | "reaction" | "movie_night_invite" | "movie_night_decided";

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
    await supabase.from("notifications").insert({
      recipient_id: params.recipientId,
      actor_id: params.actorId,
      type: params.type,
      title_id: params.titleId ?? null,
      ref_id: params.refId ?? null,
    });
  } catch {
    // Best-effort — see doc comment above.
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

/** Called from the /notifications page itself on every load — mirrors markConversationRead's pattern in messages.ts. */
export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  revalidatePath("/notifications");
}
