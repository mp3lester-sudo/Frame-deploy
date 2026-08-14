"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { isAuteurActive } from "@/lib/premium/tier";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Database } from "@/lib/supabase/types";

export type TitleImageOverride = Database["public"]["Tables"]["title_image_overrides"]["Row"];

/**
 * "Custom poster & backdrop for any title" (Auteur perk, task #339) --
 * per-viewer, not a catalogue edit (see migration 0047's comment). Reads
 * are open to anyone signed in (a lapsed Auteur subscriber should still
 * see whatever they already set, same "read access outlives the tier"
 * posture as discover-presets.ts), writes are gated to active Auteur.
 */
export async function getMyTitleImageOverride(titleId: string): Promise<TitleImageOverride | null> {
  const user = await getVerifiedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("title_image_overrides")
    .select("*")
    .eq("user_id", user.id)
    .eq("title_id", titleId)
    .maybeSingle();
  return data;
}

// Same URL a browser <img>/next/image would accept -- http(s) only, no
// data: URIs (which could otherwise be used to smuggle arbitrary content
// through a field that's rendered as an image src) and a sane length cap.
const urlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), "Must be an http(s) URL");

const setSchema = z.object({
  titleId: z.string().uuid(),
  posterUrl: urlSchema.optional().nullable(),
  backdropUrl: urlSchema.optional().nullable(),
});

export async function setTitleImageOverride(input: z.infer<typeof setSchema>): Promise<void> {
  const { titleId, posterUrl, backdropUrl } = setSchema.parse(input);
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_premium, premium_tier")
    .eq("id", user.id)
    .maybeSingle();
  if (!isAuteurActive(profile)) {
    throw new Error("Custom posters are a Marquee Auteur perk. Upgrade at /premium to customize this title.");
  }

  const { error } = await supabase.from("title_image_overrides").upsert({
    user_id: user.id,
    title_id: titleId,
    poster_url: posterUrl || null,
    backdrop_url: backdropUrl || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/movie/${titleId}`);
}

const clearSchema = z.object({ titleId: z.string().uuid() });

export async function clearTitleImageOverride(input: z.infer<typeof clearSchema>): Promise<void> {
  const { titleId } = clearSchema.parse(input);
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("title_image_overrides")
    .delete()
    .eq("user_id", user.id)
    .eq("title_id", titleId);
  if (error) throw new Error(error.message);

  revalidatePath(`/movie/${titleId}`);
}
