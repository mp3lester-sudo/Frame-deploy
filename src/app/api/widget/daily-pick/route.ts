import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rate-limit";
import { getOrCreateDailyPick } from "@/lib/recommendations/daily-pick";
import { captureServerError } from "@/lib/monitoring/sentry-server";

/**
 * Feeds the iOS home-screen widget's TimelineProvider (see
 * mobile-app/ios/App/MarqueeWidget/) -- deliberately a plain token query
 * param rather than the usual cookie-session auth every other route in
 * this app uses, because WidgetKit's extension runs as its own separate
 * OS process with no access to the main app's cookies at all. The token
 * itself (profiles.widget_token, minted by getOrCreateWidgetToken) is
 * the entire authentication story here, so it's validated by hand
 * against the service-role client instead of going through
 * getVerifiedUser()/RLS the way every other route does.
 *
 * GET (not POST) on purpose: WidgetKit's URLSession timeline fetches are
 * simple GETs, and there's no request body to speak of -- just the
 * token.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  // Keyed on the token itself, not an IP -- a NAT'd network or App
  // Store review device farm could otherwise share a rate-limit bucket
  // across unrelated widgets. Generous ceiling since a legitimate widget
  // can refresh several times a day per iOS's own schedule, plus retries
  // after a transient failure.
  if (await isRateLimited(`widget-daily-pick:${token}`, { maxRequests: 60, windowSeconds: 3600 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = createServiceRoleClient();

  const { data: profile } = await supabase.from("profiles").select("id").eq("widget_token", token).maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const pick = await getOrCreateDailyPick(supabase, profile.id);
    if (!pick) {
      // No taste signal yet (brand-new account, hasn't rated enough to
      // have a real recommendation) -- a real, distinguishable "nothing
      // to show yet" response rather than a 404/500, so the widget can
      // render its own "rate a few movies to unlock your pick" state
      // instead of looking broken.
      return NextResponse.json({ pick: null });
    }
    return NextResponse.json({
      pick: {
        titleId: pick.titleId,
        name: pick.name,
        posterUrl: pick.posterUrl,
        matchPercent: pick.matchPercent,
        reason: pick.reason,
      },
    });
  } catch (err) {
    console.error("[widget/daily-pick]", err);
    await captureServerError(err, { route: "widget/daily-pick", userId: profile.id });
    return NextResponse.json({ error: "Couldn't load today's pick" }, { status: 500 });
  }
}
