import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getRecommendationsForUser } from "./engine";

export interface DailyPick {
  titleId: string;
  name: string;
  posterUrl: string | null;
  matchPercent: number | null;
  reason: string;
}

// Same UTC-date-string convention as daily-trivia/generate.ts's
// todayKey() -- "today" here just needs to be a stable, day-granular
// cache key, not aligned to any particular person's local timezone (the
// widget refreshing at 6am UTC vs 11pm local on rollover is an
// acceptable rough edge, same tradeoff daily trivia already made).
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get-or-create today's cached pick for this user -- see migration
 * 0067's comment for why this exists at all (WidgetKit refreshes on the
 * OS's own schedule, independent of app opens, and the recommendation
 * engine is too expensive to re-run on every one of those). Backs the
 * iOS widget (src/app/api/widget/daily-pick/route.ts) exclusively for
 * now, but deliberately not widget-specific in shape or naming -- a
 * "your pick, refreshed once a day" surface is generically useful (a
 * push notification payload, a future in-app card) and shouldn't need
 * rebuilding just because a second caller shows up.
 *
 * Takes an injected client (same pattern as notify() in
 * actions/notifications.ts) rather than creating its own, because its
 * two current/expected callers authenticate completely differently: the
 * widget route has no cookie session at all (just a hand-validated
 * bearer token) and reads via the service-role client, while a future
 * in-app caller would use the normal per-request cookie client and rely
 * on daily_picks' own RLS policy instead.
 */
export async function getOrCreateDailyPick(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<DailyPick | null> {
  const pickDate = todayKey();

  const { data: cached } = await supabase
    .from("daily_picks")
    .select("title_id, match_percent, reason, titles(name, poster_url)")
    .eq("user_id", userId)
    .eq("pick_date", pickDate)
    .maybeSingle();

  if (cached) {
    const title = (cached as unknown as { titles: { name: string; poster_url: string | null } | null }).titles;
    if (title) {
      return {
        titleId: cached.title_id,
        name: title.name,
        posterUrl: title.poster_url,
        matchPercent: cached.match_percent,
        reason: cached.reason,
      };
    }
  }

  // No cached row for today (first check-in of the day, or this user's
  // cache table hasn't been touched yet) -- run the real engine once and
  // persist the result so every refresh for the rest of the day is a
  // single indexed row lookup instead of a full scoring pass.
  const { recommendations } = await getRecommendationsForUser(userId, {
    limit: 1,
    context: "solo",
    source: "widget_daily_pick",
  });
  const pick = recommendations[0];
  if (!pick) return null;

  await supabase.from("daily_picks").upsert(
    {
      user_id: userId,
      pick_date: pickDate,
      title_id: pick.title.id,
      match_percent: pick.matchPercent,
      reason: pick.reason,
    },
    { onConflict: "user_id,pick_date" }
  );

  return {
    titleId: pick.title.id,
    name: pick.title.name,
    posterUrl: pick.title.poster_url,
    matchPercent: pick.matchPercent,
    reason: pick.reason,
  };
}
