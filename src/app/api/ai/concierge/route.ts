import { NextResponse } from "next/server";
import { askConcierge } from "@/lib/ai/concierge";
import { captureServerError } from "@/lib/monitoring/sentry-server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isRateLimited } from "@/lib/rate-limit";
import { isAuteurActive } from "@/lib/premium/tier";
import { z } from "zod";

const bodySchema = z.object({
  message: z.string().min(1).max(500),
  matchEra: z.boolean().optional(),
});

// Free-tier daily cap on Ask Backlot — Premium ($7.99/mo, see /premium)
// removes this and keeps only the abuse-prevention throttle below, which
// applies regardless of plan. Generous enough that casual users rarely hit
// it, but a real, meaningful limit for frequent users, who are exactly who
// "unlimited AI concierge conversations" is meant to convert. This was the
// first of Premium's four advertised perks to actually get wired up —
// is_premium existed on profiles but nothing read it anywhere until now.
const FREE_DAILY_LIMIT = 20;
const FREE_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

// "Priority AI concierge, no queue" (Auteur perk, task #344): both tiers
// already have no *daily* cap once is_premium is true (see below), so the
// only ceiling left to differentiate is this short-window abuse throttle.
// Auteur gets a meaningfully higher one -- 3x the burst headroom -- rather
// than something purely cosmetic like a label, so someone firing off a
// string of quick follow-up questions genuinely doesn't hit it the way a
// Premium/free user doing the same thing might.
const STANDARD_BURST_LIMIT = 20;
const AUTEUR_BURST_LIMIT = 60;
const BURST_WINDOW_SECONDS = 600;

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use the concierge" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_premium, premium_tier")
    .eq("id", user.id)
    .maybeSingle();

  // Abuse-prevention throttle — applies to every plan, protecting against
  // runaway cost/abuse independent of the free/premium distinction below,
  // just at a higher ceiling for Auteur.
  const burstLimit = isAuteurActive(profile) ? AUTEUR_BURST_LIMIT : STANDARD_BURST_LIMIT;
  if (await isRateLimited(`concierge:${user.id}`, { maxRequests: burstLimit, windowSeconds: BURST_WINDOW_SECONDS })) {
    return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
  }

  if (!profile?.is_premium) {
    const overDailyLimit = await isRateLimited(`concierge-daily:${user.id}`, {
      maxRequests: FREE_DAILY_LIMIT,
      windowSeconds: FREE_DAILY_WINDOW_SECONDS,
    });
    if (overDailyLimit) {
      return NextResponse.json(
        {
          error: "You've used today's free Ask Backlot conversations.",
          upgradeUrl: "/premium",
        },
        { status: 429 }
      );
    }
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "A message is required" }, { status: 400 });
  }

  try {
    const result = await askConcierge(parsed.data.message, { matchEra: parsed.data.matchEra });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[concierge]", err);
    await captureServerError(err, { route: "ai/concierge", userId: user.id });
    return NextResponse.json({ error: "The concierge is unavailable right now" }, { status: 500 });
  }
}
