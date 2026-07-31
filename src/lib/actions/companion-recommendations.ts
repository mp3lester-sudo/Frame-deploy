"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getCandidatesForCompanionSet, firstName } from "@/lib/recommendations/movie-night";
import { calibrateMatchPercents } from "@/lib/recommendations/match-percent";
import type { ReasonDetail } from "@/lib/recommendations/explain";
import type { Recommendation } from "@/lib/recommendations/engine";

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

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .in("username", usernames);

  const foundUsernames = new Set((profiles ?? []).map((p) => p.username));
  const missing = usernames.filter((u) => !foundUsernames.has(u));
  if (missing.length) throw new Error(`No user found with username "${missing[0]}"`);

  const companions = (profiles ?? []).filter((p) => p.id !== user.id);
  if (companions.length === 0) throw new Error("That's you — add someone else to blend with");

  // Own display name too, for consensus notes that might say "leans toward
  // Michael's taste."
  const { data: selfProfile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const namesByUserId = new Map<string, string>();
  namesByUserId.set(user.id, firstName(selfProfile?.display_name, selfProfile?.username ?? "you"));
  for (const c of companions) {
    namesByUserId.set(c.id, firstName(c.display_name, c.username));
  }

  const userIds = [user.id, ...companions.map((c) => c.id)];
  const candidates = await getCandidatesForCompanionSet(userIds, namesByUserId, 6);

  // A score of exactly 0 only ever means the popularity-fallback branch
  // (nobody in the group had enough signal yet, or nothing survived the
  // fairness floor) -- same "don't show a meaningless match %" rule the
  // solo engine applies via isColdStart.
  const matchPercents = calibrateMatchPercents(candidates.map((c) => c.score));
  const recommendations: Recommendation[] = candidates.map((c, i) => {
    const detail: ReasonDetail = {
      headline: c.note,
      themes: c.title.themes ?? [],
      tone: c.title.tone ?? [],
      moodTags: c.title.mood_tags ?? [],
      pacing: c.title.pacing ?? null,
      endingType: c.title.ending_type ?? null,
      citedTitles: [],
    };
    return {
      title: c.title,
      reason: c.note,
      detail,
      score: c.score,
      matchPercent: c.score > 0 ? matchPercents[i] : null,
    };
  });

  return {
    recommendations,
    companionNames: companions.map((c) => firstName(c.display_name, c.username)),
  };
}
