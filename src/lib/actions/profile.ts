"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireUser() {
  const supabase = await createClient();
  // Trusts the user middleware already verified for this request (see
  // src/lib/auth/verified-user.ts) instead of calling
  // supabase.auth.getUser() again — that's a real network round trip to
  // Supabase's Auth server, so re-deriving it here on top of middleware
  // (and again after this action's revalidatePath re-renders the layout)
  // was tripling that latency on every single mutating button.
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

const profileSchema = z.object({
  displayName: z.string().trim().max(60).optional().or(z.literal("")),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function updateProfile(input: z.infer<typeof profileSchema>) {
  const { displayName, bio } = profileSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName || null, bio: bio || null })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath("/profile/me");
  revalidatePath(`/profile/${user.id}`);
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Every user's avatar lives at a fixed path ("{user_id}/avatar.<ext>") with
 * upsert:true, so re-uploading just overwrites the previous file in place —
 * no orphaned old files to clean up. A cache-busting query param on the
 * saved URL keeps the browser/CDN from serving the stale image afterward.
 */
export async function uploadAvatar(formData: FormData) {
  const { supabase, user } = await requireUser();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) throw new Error("No file provided");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("Image must be under 5MB");
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) throw new Error("Image must be JPEG, PNG, WebP, or GIF");

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/settings");
  revalidatePath("/profile/me");
  revalidatePath(`/profile/${user.id}`);
  return avatarUrl;
}

/** Lightweight title search for the favorites picker — name match, ranked by weighted_rating. */
export async function searchTitlesForPicker(query: string) {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("titles")
    .select("id, name, release_date, poster_url")
    .ilike("name", `%${query.trim()}%`)
    .order("weighted_rating", { ascending: false, nullsFirst: false })
    .limit(8);
  return data ?? [];
}

const favoritesSchema = z.array(z.string().uuid()).max(6);

/** Replaces the user's six favorite films in one go, in the given order (position 1-6). */
export async function setFavoriteTitles(titleIds: string[]) {
  const parsed = favoritesSchema.parse(titleIds);
  const { supabase, user } = await requireUser();

  const { error: deleteError } = await supabase.from("favorite_titles").delete().eq("user_id", user.id);
  if (deleteError) throw new Error(deleteError.message);

  if (parsed.length > 0) {
    const rows = parsed.map((titleId, i) => ({ user_id: user.id, title_id: titleId, position: i + 1 }));
    const { error: insertError } = await supabase.from("favorite_titles").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath("/settings");
  revalidatePath("/profile/me");
  revalidatePath(`/profile/${user.id}`);
}
