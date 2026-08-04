"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isPremiumActive } from "@/lib/premium/is-premium";
import { isAuteurActive } from "@/lib/premium/tier";
import { computeWrapped, computeMonthlyWrapped, computeWeeklyWrapped } from "@/lib/taste-dna/compute";
import type { WrappedResult } from "@/lib/taste-dna/wrapped";

/**
 * Wrapped: the always-fresh, private view (computeWrapped re-runs live, same
 * as Taste DNA) plus a one-way "share" action that freezes a snapshot into
 * wrapped_shares for posting publicly — see migration 0028 for why that's a
 * frozen copy rather than a live query for anonymous visitors.
 */

export async function getMyWrapped(year: number): Promise<WrappedResult | null> {
  const user = await getVerifiedUser();
  if (!user) return null;
  return computeWrapped(user.id, year);
}

export interface RecentWrappedState {
  /** false for a free account -- the page shows a Premium upsell instead
   *  of a "keep rating" placeholder, since the real blocker isn't rating
   *  volume. */
  isPremium: boolean;
  /** "week" for Auteur subscribers, "month" for Premium (task #342 gives
   *  Auteur the tighter cadence as one of its exclusive perks) -- the page
   *  uses this to pick the right headline/label rather than assuming
   *  "month" for every paid account. Meaningless when isPremium is false. */
  cadence: "week" | "month";
  result: WrappedResult | null;
}

/**
 * The "fresher than once a year" recap -- Premium gets it monthly (task
 * #140), Auteur gets it weekly instead (task #342), gated here rather than
 * in computeMonthlyWrapped/computeWeeklyWrapped themselves, same
 * "gating lives in the action, not the query" split already used for
 * Discover's advanced filters and the Ask Backlot concierge's daily cap.
 */
export async function getMyRecentWrapped(): Promise<RecentWrappedState> {
  const user = await getVerifiedUser();
  if (!user) return { isPremium: false, cadence: "month", result: null };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_premium, premium_tier, bonus_premium_until")
    .eq("id", user.id)
    .maybeSingle();
  const isPremium = isPremiumActive(profile);
  if (!isPremium) return { isPremium: false, cadence: "month", result: null };

  const cadence: "week" | "month" = isAuteurActive(profile) ? "week" : "month";
  const result = cadence === "week" ? await computeWeeklyWrapped(user.id) : await computeMonthlyWrapped(user.id);
  return { isPremium: true, cadence, result };
}

export interface WrappedShareResult {
  id: string;
}

/**
 * Recomputes server-side from userId + year rather than trusting a client-
 * supplied stats payload — a public, unauthenticated share link is exactly
 * the kind of thing someone could otherwise forge numbers into.
 */
export async function createWrappedShare(year: number): Promise<WrappedShareResult> {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");

  const stats = await computeWrapped(user.id, year);
  if (!stats) throw new Error("Not enough rated titles yet to share a recap for this year");

  const { data, error } = await supabase
    .from("wrapped_shares")
    .insert({ user_id: user.id, year, stats: stats as unknown as Record<string, unknown> })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create share link");

  return { id: data.id };
}
