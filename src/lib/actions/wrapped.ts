"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { computeWrapped, computeMonthlyWrapped } from "@/lib/taste-dna/compute";
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

export interface MonthlyWrappedState {
  /** false for a free account -- the page shows a Premium upsell instead
   *  of a "keep rating" placeholder, since the real blocker isn't rating
   *  volume. */
  isPremium: boolean;
  result: WrappedResult | null;
}

/**
 * Monthly recap is a Premium-only perk (task #140) -- checked here rather
 * than in computeMonthlyWrapped itself, same "gating lives in the action,
 * not the query" split already used for Discover's advanced filters and
 * the Ask Backlot concierge's daily cap.
 */
export async function getMyMonthlyWrapped(): Promise<MonthlyWrappedState> {
  const user = await getVerifiedUser();
  if (!user) return { isPremium: false, result: null };

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle();
  const isPremium = profile?.is_premium ?? false;
  if (!isPremium) return { isPremium: false, result: null };

  const result = await computeMonthlyWrapped(user.id);
  return { isPremium: true, result };
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
