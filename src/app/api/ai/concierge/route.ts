import { NextResponse } from "next/server";
import { askConcierge } from "@/lib/ai/concierge";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isRateLimited } from "@/lib/rate-limit";
import { z } from "zod";

const bodySchema = z.object({ message: z.string().min(1).max(500) });

// Free-tier daily cap on Ask Backlot — Premium ($7.99/mo, see /premium)
// removes this and keeps only the abuse-prevention throttle below, which
// applies regardless of plan. Generous enough that casual users rarely hit
// it, but a real, meaningful limit for frequent users, who are exactly who
// "unlimited AI concierge conversations" is meant to convert. This was the
// first of Premium's four advertised perks to actually get wired up —
// is_premium existed on profiles but nothing read it anywhere until now.
const FREE_DAILY_LIMIT = 20;
const FREE_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use the concierge" }, { status: 401 });
  }

  // Abuse-prevention throttle — applies to every plan, protecting against
  // runaway cost/abuse independent of the free/premium distinction below.
  if (await isRateLimited(`concierge:${user.id}`, { maxRequests: 20, windowSeconds: 600 })) {
    return NextResponse.json({ error: "Too many requests — try again in a few minutes" }, { status: 429 });
  }

  const { data: profile } = await supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle();
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
    const result = await askConcierge(parsed.data.message);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[concierge]", err);
    return NextResponse.json({ error: "The concierge is unavailable right now" }, { status: 500 });
  }
}
