"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ExperienceTier } from "@/lib/constants/experience-tier";
import { tierForPoints } from "@/lib/profile/cinema-score";
import type { MediaType } from "@/lib/context/media-type-cookie";

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

// Replaces the old setExperienceTier self-report write -- the tier badge
// (still the same Casual Viewer/Film Buff/Cinephile labels, still the
// same rookie/intermediate/pro underlying values) is now earned from
// actual watching/reviewing activity via the compute_cinema_score DB
// function (migration 0040) instead of picked once during onboarding and
// left alone. No auth/ownership check here beyond just being logged in --
// ratings/reviews are already publicly readable (this is the same data
// a profile page's Watched count and review list already expose), so
// there's nothing more sensitive being computed for someone else's userId
// than what's already visible elsewhere on their profile.
export async function getCinemaScore(
  userId: string,
  mediaType: "movie" | "tv" = "movie"
): Promise<{
  points: number;
  watchedCount: number;
  reviewedCount: number;
  tier: ExperienceTier;
}> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .rpc("compute_cinema_score", { p_user_id: userId, p_media_type: mediaType })
    .maybeSingle();
  if (error || !data) {
    return { points: 0, watchedCount: 0, reviewedCount: 0, tier: "rookie" };
  }
  return {
    points: data.points,
    watchedCount: data.watched_count,
    reviewedCount: data.reviewed_count,
    tier: tierForPoints(data.points),
  };
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

/** Lightweight title search for the favorites picker — name match, ranked by
 *  weighted_rating, scoped to the toggle whose Pyramid is being edited so a
 *  Movies-mode search never turns up a TV show to pick as a "favorite
 *  movie" and vice versa. */
export async function searchTitlesForPicker(query: string, mediaType: MediaType) {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("titles")
    .select("id, name, release_date, poster_url")
    .eq("type", mediaType)
    .ilike("name", `%${query.trim()}%`)
    .order("weighted_rating", { ascending: false, nullsFirst: false })
    .limit(8);
  return data ?? [];
}

const favoritesSchema = z.array(z.string().uuid()).max(6);

/** Replaces the user's six favorite titles FOR ONE MEDIA TYPE in one go, in
 *  the given order (position 1-6) -- "fully separate profiles" means this
 *  only ever touches the Movies Pyramid or the Shows Pyramid, never both,
 *  so picking new favorite shows can't bump a favorite movie out of its
 *  slot (see migration 0072). */
export async function setFavoriteTitles(titleIds: string[], mediaType: MediaType) {
  const parsed = favoritesSchema.parse(titleIds);
  const { supabase, user } = await requireUser();

  const { error: deleteError } = await supabase
    .from("favorite_titles")
    .delete()
    .eq("user_id", user.id)
    .eq("media_type", mediaType);
  if (deleteError) throw new Error(deleteError.message);

  if (parsed.length > 0) {
    const rows = parsed.map((titleId, i) => ({ user_id: user.id, title_id: titleId, position: i + 1, media_type: mediaType }));
    const { error: insertError } = await supabase.from("favorite_titles").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  // Taste-signal expansion (migration 0075): the Pyramid is a user's most
  // deliberate taste statement, previously invisible to the recommendation
  // engine entirely. Type-scoped (not the whole-user recompute_taste_vector_
  // for_user) since we already know exactly which vector changed here --
  // no reason to also touch the other media type's vector on every Pyramid
  // edit. Awaited, unlike writeReview's fire-and-forget sentiment call --
  // this is a fast DB-only recompute (no OpenAI round trip), and a user
  // rearranging their Pyramid should see it reflected immediately.
  await supabase.rpc("recompute_taste_vector_for_user_for_type", { p_user_id: user.id, p_media_type: mediaType });

  revalidatePath("/settings");
  revalidatePath("/profile/me");
  revalidatePath(`/profile/${user.id}`);
}
