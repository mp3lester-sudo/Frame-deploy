import { NextResponse } from "next/server";
import { runReengagementCampaign } from "@/lib/reengagement/campaign";
import { runFavoriteDirectorAlerts } from "@/lib/notifications/favorite-director-alerts";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Triggered daily by Vercel Cron (see vercel.json). Vercel automatically
 * sends `Authorization: Bearer $CRON_SECRET` on cron-triggered requests once
 * that env var is set on the project -- see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs. Without CRON_SECRET
 * configured, this route 401s on every request rather than silently
 * running unauthenticated (e.g. if someone finds the URL and GETs it).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 401 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await runReengagementCampaign();

  // Piggybacks on this same daily tick rather than its own cron entry --
  // rate_limit_buckets (migration 0007) now gets written on every signup/
  // login/password-reset attempt (see auth.ts) on top of the AI endpoints
  // it already covered, so old buckets need regular pruning or the table
  // grows forever. prune_rate_limit_buckets() only deletes rows already
  // past their window, so this is safe to run on any schedule; a failure
  // here shouldn't fail the whole cron tick since the reengagement emails
  // above already sent successfully.
  const { error: pruneError } = await createServiceRoleClient().rpc("prune_rate_limit_buckets");
  if (pruneError) {
    console.error("[cron] prune_rate_limit_buckets failed:", pruneError.message);
  }

  // Also piggybacked onto this same daily tick, same reasoning as the
  // pruning call above -- "new from a director you love" only needs to
  // run roughly daily and has no reason to be its own separate Vercel
  // Cron entry. Isolated in its own try/catch so a failure here can never
  // take down the reengagement emails or bucket pruning that already
  // succeeded above.
  let directorAlertSummary;
  try {
    directorAlertSummary = await runFavoriteDirectorAlerts();
  } catch (err) {
    console.error("[cron] runFavoriteDirectorAlerts failed:", err);
  }

  return NextResponse.json({ ...summary, directorAlerts: directorAlertSummary });
}
