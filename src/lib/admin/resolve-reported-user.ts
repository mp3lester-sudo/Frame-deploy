import type { createServiceRoleClient } from "@/lib/supabase/server";
import type { ReportableContentType } from "@/lib/moderation/validate";

/**
 * Reports are polymorphic (content_type + content_id, see migration 0035)
 * and the table itself only records who *filed* the report, not who the
 * reported content actually belongs to -- there was no way to jump from
 * "here's an open report" to "here's the account that posted this" until
 * now. Each content type keeps its author under a different column name
 * (reviews/review_comments/club_posts use user_id, messages uses
 * sender_id, and a "profile" report's target IS the content_id itself),
 * so this is a small per-type lookup rather than one generic query.
 * Returns null if the content no longer exists (already deleted) --
 * callers should treat that the same as "nothing to act on."
 */
export async function resolveReportedUserId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  contentType: ReportableContentType,
  contentId: string
): Promise<string | null> {
  switch (contentType) {
    case "profile":
      return contentId;
    case "review": {
      const { data } = await supabase.from("reviews").select("user_id").eq("id", contentId).maybeSingle();
      return data?.user_id ?? null;
    }
    case "review_comment": {
      const { data } = await supabase.from("review_comments").select("user_id").eq("id", contentId).maybeSingle();
      return data?.user_id ?? null;
    }
    case "message": {
      const { data } = await supabase.from("messages").select("sender_id").eq("id", contentId).maybeSingle();
      return data?.sender_id ?? null;
    }
    case "club_post": {
      const { data } = await supabase.from("club_posts").select("user_id").eq("id", contentId).maybeSingle();
      return data?.user_id ?? null;
    }
    default:
      return null;
  }
}

/**
 * Deletes the underlying reported row for a given content type -- the
 * "act on a report" counterpart to resolveReportedUserId above. Profile
 * reports have no separate row to delete (the report itself is about the
 * account, not a piece of content it created); use suspendUser for that
 * case instead. No-ops (rather than throwing) if the row is already gone.
 */
export async function deleteReportedRow(
  supabase: ReturnType<typeof createServiceRoleClient>,
  contentType: ReportableContentType,
  contentId: string
): Promise<{ error: string | null }> {
  const tableByType: Partial<Record<ReportableContentType, string>> = {
    review: "reviews",
    review_comment: "review_comments",
    message: "messages",
    club_post: "club_posts",
  };
  const table = tableByType[contentType];
  if (!table) return { error: "This content type can't be deleted directly -- suspend the account instead." };

  const { error } = await supabase.from(table).delete().eq("id", contentId);
  return { error: error?.message ?? null };
}
