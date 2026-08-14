"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
import { validateReport, type ReportableContentType } from "@/lib/moderation/validate";
import { isRateLimited } from "@/lib/rate-limit";
import { captureServerError } from "@/lib/monitoring/sentry-server";

async function requireUser() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/**
 * Reports go straight into the reports table with status 'open' -- there's
 * no moderation queue UI yet (that's a real admin surface, out of scope
 * here), but the report itself is durable and queryable the moment one is
 * needed. RLS (see migration 0035) means the reporter can read their own
 * report back, which is all the UI needs to show a "Reported" state.
 */
export async function reportContent(
  contentType: ReportableContentType,
  contentId: string,
  reason: string,
  rawNote: string
) {
  const validation = validateReport(reason, rawNote);
  if (!validation.ok) throw new Error(validation.error);
  const { supabase, user } = await requireUser();

  // 15/hour is far more than anyone reporting in good faith needs, and
  // stops the reports queue itself from being flooded/griefed.
  if (await isRateLimited(`report-content:${user.id}`, { maxRequests: 15, windowSeconds: 3600 })) {
    throw new Error("You're submitting reports too fast — slow down a bit");
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    content_type: contentType,
    content_id: contentId,
    reason: validation.reason,
    note: validation.note,
  });
  if (error) {
    await captureServerError(new Error(error.message), { action: "reportContent", userId: user.id, contentType, contentId });
    throw new Error(error.message);
  }
}

/**
 * Blocking is directional and immediate -- no confirmation round trip to
 * the blocked user, same as most social apps. Only enforced today at the
 * one point it matters most (starting a new DM thread, see
 * getOrCreateConversation's isBlockedEitherWay check in messages.ts);
 * hiding a blocked user's reviews/comments/posts from feeds is a broader
 * change across several query files and is intentionally left for a
 * follow-up rather than half-done here.
 */
export async function blockUser(blockedId: string) {
  const { supabase, user } = await requireUser();
  if (user.id === blockedId) throw new Error("You can't block yourself");

  const { error } = await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: blockedId });
  if (error) throw new Error(error.message);

  revalidatePath(`/profile/${blockedId}`);
}

export async function unblockUser(blockedId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", blockedId);
  revalidatePath(`/profile/${blockedId}`);
}

export async function getBlockStatus(otherUserId: string): Promise<{ blocked: boolean }> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("user_blocks")
    .select("blocker_id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", otherUserId)
    .maybeSingle();
  return { blocked: !!data };
}
