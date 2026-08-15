"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getCandidatesForCompanionSet, firstName } from "@/lib/recommendations/movie-night";
import { calibrateMatchPercents } from "@/lib/recommendations/match-percent";
import type { Recommendation } from "@/lib/recommendations/engine";
import { getActiveMediaType } from "@/lib/context/media-type";

const usernameSchema = z
  .string()
  .min(1)
  .transform((s) => s.trim().toLowerCase().replace(/^@/, ""));

// "With friends" is still a real, specific group tonight, not a broadcast
// to everyone you follow -- capped low on purpose so this stays an ad-hoc
// "who's actually here" pick, not something that needs its own invite UI.
const MAX_COMPANIONS = 4;

export interface CompanionBlendResult {
  recommendations: Recommendation[];
  /** Resolved first names, in the order picked -- lets the picker confirm
   *  who it blended with ("Blending with Eli") even if a display name
   *  differs from the username that was typed in. */
  companionNames: string[];
}

/**
 * Powers the home page's "Date night" / "With friends" companion picker.
 * Given the usernames typed in just now, resolves them to real accounts
 * and runs the same strict group-fairness blend Movie Night uses (see
 * getCandidatesForUserGroup in movie-night.ts): a pick never surfaces if
 * it's a clear miss for either person, even if the average looks great.
 *
 * Deliberately ad-hoc -- no persisted session, no invite/accept flow, just
 * "who's actually in the room with me right now." For a standing, planned
 * group decision, Movie Night (with its own invite flow) is still the
 * right tool.
 */
export async function getCompanionBlendRecommendations(usernamesInput: string[]): Promise<CompanionBlendResult> {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");

  const usernames = [...new Set(usernamesInput.map((u) => usernameSchema.parse(u)))].slice(0, MAX_COMPANIONS);
  if (usernames.length === 0) throw new Error("Add at least one person to blend with");

  // The companions lookup and the caller's own profile lookup (for
  // consensus-note display names, see below) don't depend on each other
  // -- fired together instead of one after another.
  const [{ data: profiles }, { data: selfProfile }] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name").in("username", usernames),
    supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle(),
  ]);

  const foundUsernames = new Set((profiles ?? []).map((p) => p.username));
  const missing = usernames.filter((u) => !foundUsernames.has(u));
  if (missing.length) throw new Error(`No user found with username "${missing[0]}"`);

  const companions = (profiles ?? []).filter((p) => p.id !== user.id);
  if (companions.length === 0) throw new Error("That's you — add someone else to blend with");

  const namesByUserId = new Map<string, string>();
  namesByUserId.set(user.id, firstName(selfProfile?.display_name, selfProfile?.username ?? "you"));
  for (const c of companions) {
    namesByUserId.set(c.id, firstName(c.display_name, c.username));
  }

  const userIds = [user.id, ...companions.map((c) => c.id)];
  const mediaType = await getActiveMediaType();
  // No explicit limit here -- getCandidatesForCompanionSet scales the pool
  // to the group size itself (see candidateLimitForGroupSize).
  const candidates = await getCandidatesForCompanionSet(userIds, namesByUserId, mediaType);

  // A score of exactly 0 only ever means the popularity-fallback branch
  // (nobody in the group had enough signal yet, or nothing survived the
  // fairness floor) -- same "don't show a meaningless match %" rule the
  // solo engine applies via isColdStart.
  const matchPercents = calibrateMatchPercents(candidates.map((c) => c.score));
  const recommendations: Recommendation[] = candidates.map((c, i) => ({
    title: c.title,
    reason: c.note,
    detail: c.detail,
    score: c.score,
    matchPercent: c.score > 0 ? matchPercents[i] : null,
    // Companion/group picks don't surface a director credit anywhere in
    // the UI (CompanionPicker has no meta line for it) -- no need to pay
    // for the lookup just to satisfy the shared Recommendation shape.
    director: null,
  }));

  return {
    recommendations,
    companionNames: companions.map((c) => firstName(c.display_name, c.username)),
  };
}
