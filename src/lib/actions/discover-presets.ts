"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isAuteurActive } from "@/lib/premium/tier";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Database } from "@/lib/supabase/types";

export type DiscoverFilterPreset = Database["public"]["Tables"]["discover_filter_presets"]["Row"];

/**
 * "Save your own Discover filter presets" (Auteur perk, task #340) --
 * gated here rather than by RLS. RLS already stops a non-owner from
 * touching someone else's rows; it can't stop a non-Auteur account from
 * creating rows of its own, so the tier check has to live in the action.
 * Read-only listing (getMyDiscoverPresets) is NOT gated the same way --
 * a subscriber whose Auteur lapses should still see (and be able to
 * delete) presets they already saved, just not save new ones.
 */
export async function getMyDiscoverPresets(): Promise<DiscoverFilterPreset[]> {
  const user = await getVerifiedUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("discover_filter_presets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}

const saveSchema = z.object({
  name: z.string().trim().min(1).max(40),
  genre: z.string().optional(),
  era: z.string().optional(),
  pacing: z.string().optional(),
  tone: z.string().optional(),
  mood: z.string().optional(),
});

export async function saveDiscoverPreset(input: z.infer<typeof saveSchema>): Promise<void> {
  const { name, genre, era, pacing, tone, mood } = saveSchema.parse(input);
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_premium, premium_tier")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAuteurActive(profile)) {
    throw new Error("Saved filter presets are a Marquee Auteur perk. Upgrade at /premium to save this search.");
  }

  const { error } = await supabase.from("discover_filter_presets").insert({
    user_id: user.id,
    name,
    genre: genre || null,
    era: era || null,
    pacing: pacing || null,
    tone: tone || null,
    mood: mood || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/discover");
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteDiscoverPreset(input: z.infer<typeof deleteSchema>): Promise<void> {
  const { id } = deleteSchema.parse(input);
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();
  // RLS (auth.uid() = user_id) is the real backstop here -- the .eq below
  // is belt-and-suspenders so a stale/forged id for someone else's preset
  // fails a plain row-not-found rather than depending on RLS alone.
  const { error } = await supabase.from("discover_filter_presets").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/discover");
}
