"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isAdminEmail } from "@/lib/admin/is-admin";
import { revalidatePath } from "next/cache";
import { resolveReportedUserId, deleteReportedRow } from "@/lib/admin/resolve-reported-user";
import type { ReportableContentType } from "@/lib/moderation/validate";
import { captureServerError } from "@/lib/monitoring/sentry-server";

/**
 * Admin actions always re-check isAdminEmail() themselves rather than
 * trusting that the page that rendered the button already gated access --
 * same "never trust the caller" discipline as every other server action in
 * this app (see requireUser() in actions/moderation.ts etc.), just with an
 * admin check instead of a plain-auth check.
 */
async function requireAdmin() {
  const user = await getVerifiedUser();
  if (!user || !isAdminEmail(user.email)) throw new Error("Not authorized");
  return user;
}

/**
 * Best-effort audit-log write (migration 0098_admin_actions.sql). Wrapped
 * so a missing table (the migration hasn't been run yet against this
 * project) or any other insert failure never blocks the actual admin
 * action it's logging -- losing the paper trail for one action is far
 * better than an admin being unable to suspend an abusive account because
 * a logging table doesn't exist yet. Failures are still reported to
 * Sentry/console so a persistently broken audit log doesn't go unnoticed
 * forever.
 */
async function logAdminAction(params: {
  adminId: string;
  targetUserId: string | null;
  action: "suspend_user" | "unsuspend_user" | "delete_content";
  reason: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("admin_actions").insert({
      admin_id: params.adminId,
      target_user_id: params.targetUserId,
      action: params.action,
      reason: params.reason,
      metadata: params.metadata ?? {},
    });
    if (error) {
      console.error("[admin] failed to write admin_actions log:", error.message);
      await captureServerError(new Error(error.message), { action: "logAdminAction" });
    }
  } catch (err) {
    console.error("[admin] admin_actions insert threw:", err instanceof Error ? err.message : err);
  }
}

const REPORT_STATUSES = ["reviewed", "dismissed"] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Uses the service-role client rather than the RLS-bound one -- reports
 * RLS (migration 0035) only lets a reporter see/insert their own rows,
 * deliberately with no "admins can read everything" policy, since
 * reviewing reports is meant to go through this privileged, admin-gated
 * path instead of a broader RLS carve-out.
 */
export async function resolveReport(reportId: string, status: ReportStatus) {
  await requireAdmin();
  if (!REPORT_STATUSES.includes(status)) throw new Error("Invalid status");

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("reports").update({ status }).eq("id", reportId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/reports");
}

/**
 * Deletes the reported content itself (review/comment/message/club post)
 * and marks the report reviewed in one step -- previously an admin could
 * only dismiss or mark-reviewed a report, with no way to actually remove
 * the thing that was reported without going around the app into the
 * Supabase dashboard directly. A "profile" report has no separate row to
 * delete (see resolveReportedUserId) -- suspendUser is the right action
 * for those instead, so this throws rather than silently no-op-ing if
 * called on one by mistake.
 */
export async function deleteReportedContent(
  reportId: string,
  contentType: ReportableContentType,
  contentId: string,
  reason: string
) {
  const admin = await requireAdmin();
  if (contentType === "profile") {
    throw new Error("Profile reports have no content to delete -- suspend the account instead.");
  }

  const supabase = createServiceRoleClient();
  const targetUserId = await resolveReportedUserId(supabase, contentType, contentId);

  const { error } = await deleteReportedRow(supabase, contentType, contentId);
  if (error) throw new Error(error);

  const { error: statusError } = await supabase.from("reports").update({ status: "reviewed" }).eq("id", reportId);
  if (statusError) console.error("[admin] failed to mark report reviewed after delete:", statusError.message);

  await logAdminAction({
    adminId: admin.id,
    targetUserId,
    action: "delete_content",
    reason: reason.trim() || null,
    metadata: { reportId, contentType, contentId },
  });

  revalidatePath("/admin/reports");
}

const SUSPEND_DURATIONS = {
  "24h": "24h",
  "7d": "168h",
  "30d": "720h",
  permanent: "876000h", // ~100 years -- GoTrue has no permanent "forever" value; same convention deleteAccount() already uses.
} as const;
export type SuspendDuration = keyof typeof SUSPEND_DURATIONS;

/**
 * Admin-initiated suspension -- the counterpart to deleteAccount()'s own
 * self-service ban in auth.ts, but usable against *any* account, not just
 * your own, and reversible (unsuspendUser below) since a moderation
 * suspension isn't the same finality as someone deleting their own
 * account. Doesn't touch profile data at all (unlike deleteAccount) --
 * the account should look exactly as it did before once unsuspended.
 */
export async function suspendUser(userId: string, duration: SuspendDuration, reason: string) {
  const admin = await requireAdmin();
  if (!reason.trim()) throw new Error("A reason is required to suspend an account");
  if (userId === admin.id) throw new Error("You can't suspend your own account");

  const service = createServiceRoleClient();
  const { error } = await service.auth.admin.updateUserById(userId, {
    ban_duration: SUSPEND_DURATIONS[duration],
  });
  if (error) throw new Error(error.message);

  await logAdminAction({
    adminId: admin.id,
    targetUserId: userId,
    action: "suspend_user",
    reason: reason.trim(),
    metadata: { duration },
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/reports");
}

export async function unsuspendUser(userId: string, reason: string) {
  const admin = await requireAdmin();

  const service = createServiceRoleClient();
  // "none" is GoTrue's own sentinel for clearing an existing ban --
  // there's no separate "unban" endpoint, only updateUserById with this
  // specific value.
  const { error } = await service.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (error) throw new Error(error.message);

  await logAdminAction({
    adminId: admin.id,
    targetUserId: userId,
    action: "unsuspend_user",
    reason: reason.trim() || null,
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export type UserSearchResult = {
  id: string;
  username: string;
  display_name: string | null;
  is_premium: boolean;
  premium_tier: "premium" | "auteur" | null;
  deleted_at: string | null;
  created_at: string;
};

/**
 * Search by username/display name (a straightforward profiles query) or,
 * if the query looks like an email, by listing auth users and matching --
 * the Supabase JS admin API has no server-side "filter by email" param in
 * the version this project pins, so an email search pages through
 * auth.admin.listUsers() and filters in memory. Bounded to 5 pages
 * (5,000 users) rather than the whole user base -- acceptable for a
 * single-owner app at current scale (see is-admin.ts's own scale
 * assumption); revisit if/when this becomes a real bottleneck.
 */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  await requireAdmin();
  const q = query.trim();
  if (!q) return [];

  const supabase = createServiceRoleClient();

  if (q.includes("@")) {
    const matchIds: string[] = [];
    for (let page = 1; page <= 5; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("[admin] listUsers failed during email search:", error.message);
        break;
      }
      for (const u of data.users) {
        if (u.email?.toLowerCase().includes(q.toLowerCase())) matchIds.push(u.id);
      }
      if (data.users.length < 1000) break;
    }
    if (matchIds.length === 0) return [];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, is_premium, premium_tier, deleted_at, created_at")
      .in("id", matchIds)
      .limit(25);
    return (profiles ?? []) as UserSearchResult[];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, is_premium, premium_tier, deleted_at, created_at")
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(25);
  if (error) {
    console.error("[admin] searchUsers profiles query failed:", error.message);
    return [];
  }
  return (data ?? []) as UserSearchResult[];
}

export type UserDetail = {
  id: string;
  username: string;
  display_name: string | null;
  is_premium: boolean;
  premium_tier: "premium" | "auteur" | null;
  deleted_at: string | null;
  created_at: string;
  email: string | null;
  isBanned: boolean;
  subscription: { status: string; tier: string; current_period_end: string | null } | null;
  reportsFiledCount: number;
  reportsReceivedCount: number;
  recentActions: {
    id: string;
    action: string;
    reason: string | null;
    created_at: string;
    admin_username: string | null;
  }[];
};

/**
 * Everything an admin needs to decide what to do about one account, in
 * one query fan-out -- previously this was scattered across the Supabase
 * dashboard's table editor (profile), Stripe's own dashboard
 * (subscription), and nowhere at all (reports involving this person,
 * prior admin actions taken against them).
 */
export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const [{ data: profile }, { data: authUser }, { data: subscription }, { count: filedCount }, { count: receivedCount }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, is_premium, premium_tier, deleted_at, created_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase.auth.admin.getUserById(userId),
      supabase.from("subscriptions").select("status, tier, current_period_end").eq("user_id", userId).maybeSingle(),
      supabase.from("reports").select("id", { count: "exact", head: true }).eq("reporter_id", userId),
      // Reports "received" means this user is the one whose content/profile
      // was reported -- reports has no target-user column (see
      // resolveReportedUserId), so a profile-type report where content_id
      // IS the user id is the only case countable directly in SQL; content
      // reports (reviews/messages/etc.) require the same per-row resolution
      // getUserDetail's caller already has to do elsewhere, so this count
      // is a floor (profile reports only), not the full figure.
      supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("content_type", "profile")
        .eq("content_id", userId),
    ]);

  if (!profile) return null;

  const { data: actionRows } = await supabase
    .from("admin_actions")
    .select("id, action, reason, created_at, admin_id")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const adminIds = [...new Set((actionRows ?? []).map((r) => r.admin_id).filter(Boolean))] as string[];
  const { data: adminProfiles } = adminIds.length
    ? await supabase.from("profiles").select("id, username").in("id", adminIds)
    : { data: [] as { id: string; username: string }[] };
  const adminNames = new Map((adminProfiles ?? []).map((p) => [p.id, p.username]));

  const bannedUntil = (authUser?.user as { banned_until?: string } | undefined)?.banned_until ?? null;

  return {
    ...profile,
    email: authUser?.user?.email ?? null,
    isBanned: !!bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
    subscription: subscription ?? null,
    reportsFiledCount: filedCount ?? 0,
    reportsReceivedCount: receivedCount ?? 0,
    recentActions: (actionRows ?? []).map((r) => ({
      id: r.id,
      action: r.action,
      reason: r.reason,
      created_at: r.created_at,
      admin_username: r.admin_id ? adminNames.get(r.admin_id) ?? null : null,
    })),
  };
}
