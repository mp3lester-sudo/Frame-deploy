import { NextResponse } from "next/server";
import { runReengagementCampaign } from "@/lib/reengagement/campaign";

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
  return NextResponse.json(summary);
}
