"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isAdminEmail } from "@/lib/admin/is-admin";
import { revalidatePath } from "next/cache";

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
