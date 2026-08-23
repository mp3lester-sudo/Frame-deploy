import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Recommendation } from "./engine";

/**
 * Fire-and-forget logging of what a user was actually recommended, to
 * recommendation_impressions (migration 0051) -- the missing half of the
 * "is this actually working" question. Without this, tuning the engine
 * (title-level negative feedback, implicit signals, real collaborative
 * filtering -- see the other rec-accuracy tasks) is just guessing at
 * whether each change helped; with it, a later query can join forward to
 * ratings/watch_history and check whether match% actually predicts what a
 * user goes on to rate well.
 *
 * Same pattern as logDebugError (monitoring/debug-log.ts): service-role
 * client so it bypasses RLS regardless of the caller's own auth context,
 * never throws (a logging failure must never break the recommendations
 * response itself), and no-ops without SUPABASE_SERVICE_ROLE_KEY so local/
 * preview environments without that key don't crash.
 *
 * Deliberately NOT awaited by callers -- logging is a side effect the
 * response shouldn't wait on. Callers just do
 * `void logRecommendationImpressions(...)`.
 */
export async function logRecommendationImpressions(
  userId: string,
  recommendations: Recommendation[],
  {
    isColdStart = false,
    source = "home",
    // Recommendation intelligence audit finding #5 (migration 0079): which
    // upstream signals (match_titles_for_user, similarity_to_disliked_titles,
    // similarity_to_implicit_positive_titles, most_similar_liked_titles_batch,
    // or the finding #1 self-heal recompute) silently degraded past their
    // timeout for this batch, if any. Written alongside is_cold_start/reason
    // so "genuinely no taste vector" and "vector exists but something
    // upstream degraded" are queryable as two different things instead of
    // both just looking like "a request completed."
    degradedSignals,
  }: { isColdStart?: boolean; source?: string; degradedSignals?: string[] } = {}
) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (recommendations.length === 0) return;
  try {
    await createServiceRoleClient()
      .from("recommendation_impressions")
      .insert(
        recommendations.map((r) => ({
          user_id: userId,
          title_id: r.title.id,
          match_percent: r.matchPercent,
          is_cold_start: isColdStart,
          reason: r.reason,
          source,
          degraded_signals: degradedSignals && degradedSignals.length ? degradedSignals : null,
        }))
      );
  } catch {
    // Never let impression logging itself throw -- see comment above.
  }
}
