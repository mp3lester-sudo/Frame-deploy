import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * "While you were away" home hero (magic-moments audit) -- only ever
 * renders for a returning user who's been gone at least INACTIVE_DAYS,
 * the same bar reengagement/campaign.ts and its reengagement_candidates()
 * RPC already use for "this account has gone quiet." Deliberately doesn't
 * reuse that RPC directly (it's service-role/cron-shaped, batch-scans
 * every profile) -- this needs a single user's own gap, computed from the
 * request-scoped client, which is a single indexed aggregate query
 * (activity_events already has a (user_id, created_at desc) index) that
 * runs on every home load. The early return below means the two heavier
 * lookups after it (new-from-favorite-director notifications) only ever
 * run for the rare inactive slice of traffic, not on every page view.
 */

const INACTIVE_DAYS = 14;

export interface WelcomeBackTitle {
  id: string;
  name: string;
  posterUrl: string | null;
}

export interface WelcomeBackData {
  daysAway: number;
  newFromFavoriteDirectors: WelcomeBackTitle[];
}

export async function getWelcomeBackData(userId: string): Promise<WelcomeBackData | null> {
  const supabase = await createClient();

  const [{ data: lastEvent }, { data: profile }] = await Promise.all([
    supabase
      .from("activity_events")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
  ]);

  const lastActive = lastEvent?.created_at ?? profile?.created_at;
  if (!lastActive) return null;

  const daysAway = Math.floor((Date.now() - new Date(lastActive).getTime()) / (24 * 60 * 60 * 1000));
  if (daysAway < INACTIVE_DAYS) return null;

  // Reuses the notifications the daily favorite-director-alerts cron job
  // already generated for this user (see
  // src/lib/notifications/favorite-director-alerts.ts) -- no re-scanning
  // the catalogue or re-deriving "is this a favorite director" here, just
  // reading what that job already decided and already wrote. Two-step
  // lookup (ids, then titles) rather than an embedded join, matching the
  // existing notifications page's own pattern (src/app/notifications/
  // page.tsx) rather than guessing at the FK relationship name.
  const { data: alertRows } = await supabase
    .from("notifications")
    .select("title_id")
    .eq("recipient_id", userId)
    .eq("type", "new_from_favorite_director")
    .gte("created_at", lastActive)
    .not("title_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);

  const titleIds = (alertRows ?? []).map((r) => r.title_id).filter((id): id is string => !!id);
  if (titleIds.length === 0) return { daysAway, newFromFavoriteDirectors: [] };

  const { data: titles } = await supabase.from("titles").select("id, name, poster_url").in("id", titleIds);
  const titleById = new Map((titles ?? []).map((t) => [t.id, t]));
  const newFromFavoriteDirectors: WelcomeBackTitle[] = titleIds
    .map((id) => titleById.get(id))
    .filter((t): t is { id: string; name: string; poster_url: string | null } => !!t)
    .map((t) => ({ id: t.id, name: t.name, posterUrl: t.poster_url }));

  return { daysAway, newFromFavoriteDirectors };
}
