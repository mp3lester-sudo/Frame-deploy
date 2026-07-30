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

/**
 * Rating a title is the single most important write in the app: it's what
 * feeds the Taste Graph. Every rating does three things in one transaction-ish
 * flow: records the rating, logs a watch + activity event, and folds the
 * title's embedding into the user's taste vector (see migration 0003).
 */
const rateSchema = z.object({ titleId: z.string().uuid(), score: z.number().min(0.5).max(5) });

export async function rateTitle(input: z.infer<typeof rateSchema>) {
  const { titleId, score } = rateSchema.parse(input);
  const { supabase, user } = await requireUser();

  await supabase.from("ratings").upsert({ user_id: user.id, title_id: titleId, score });
  await supabase.from("watch_history").upsert({ user_id: user.id, title_id: titleId });
  await supabase.from("activity_events").insert({
    user_id: user.id,
    event_type: "rated",
    title_id: titleId,
  });
  await supabase.rpc("upsert_taste_vector_from_rating", {
    p_user_id: user.id,
    p_title_id: titleId,
    p_score: score,
  });

  revalidatePath(`/movie/${titleId}`);
  revalidatePath("/");
}

/**
 * Undo a rating/watch (misclicks happen). Removes the rating, the
 * watch-history row, and the "rated" activity event it generated, so it
 * disappears from the profile's Recently Watched grid and the social feed
 * too. Doesn't attempt to reverse the taste-vector contribution from
 * upsert_taste_vector_from_rating — there's no inverse operation for that
 * incremental blend, though this is currently moot since no titles have
 * embeddings yet (see scripts/verify-home.ts's note on that).
 */
export async function unrateTitle(titleId: string) {
  const schema = z.object({ titleId: z.string().uuid() });
  const { titleId: id } = schema.parse({ titleId });
  const { supabase, user } = await requireUser();

  await supabase.from("ratings").delete().eq("user_id", user.id).eq("title_id", id);
  await supabase.from("watch_history").delete().eq("user_id", user.id).eq("title_id", id);
  await supabase
    .from("activity_events")
    .delete()
    .eq("user_id", user.id)
    .eq("title_id", id)
    .eq("event_type", "rated");

  revalidatePath(`/movie/${id}`);
  revalidatePath("/");
  revalidatePath("/profile/me");
  revalidatePath(`/profile/${user.id}`);
}

const reviewSchema = z.object({
  titleId: z.string().uuid(),
  body: z.string().min(1).max(5000),
  containsSpoilers: z.boolean().default(false),
});

export async function writeReview(input: z.infer<typeof reviewSchema>) {
  const { titleId, body, containsSpoilers } = reviewSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { data: review } = await supabase
    .from("reviews")
    .insert({ user_id: user.id, title_id: titleId, body, contains_spoilers: containsSpoilers })
    .select("id")
    .single();

  await supabase.from("activity_events").insert({
    user_id: user.id,
    event_type: "reviewed",
    title_id: titleId,
    ref_id: review?.id,
  });

  revalidatePath(`/movie/${titleId}`);
}

// Undo for an accidental/regretted review — mirrors unrateTitle's pattern
// (own-row delete + matching activity_events cleanup) but leaves the star
// rating alone, since a review and a rating are separate rows a user might
// reasonably want to walk back independently (e.g. keep the rating, delete
// a review they wrote in the heat of the moment).
export async function deleteReview(reviewId: string) {
  const schema = z.object({ reviewId: z.string().uuid() });
  const { reviewId: id } = schema.parse({ reviewId });
  const { supabase, user } = await requireUser();

  const { data: review } = await supabase
    .from("reviews")
    .select("title_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!review) throw new Error("Review not found");

  // RLS ("users delete own reviews") already scopes this to the owner, but
  // the explicit .eq("user_id", ...) keeps intent obvious here too.
  const { error } = await supabase.from("reviews").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  // review_reactions and review_comments cascade-delete with the review at
  // the DB level (see migrations 0001/0012); activity_events doesn't have a
  // FK to reviews (sibling reference via ref_id), so it needs its own
  // cleanup, same as unrateTitle does for "rated" events.
  await supabase
    .from("activity_events")
    .delete()
    .eq("user_id", user.id)
    .eq("ref_id", id)
    .eq("event_type", "reviewed");

  revalidatePath(`/movie/${review.title_id}`);
  revalidatePath("/hot-takes");
}

export async function toggleFollow(followeeId: string) {
  const { supabase, user } = await requireUser();
  if (user.id === followeeId) throw new Error("Cannot follow yourself");

  const { data: existing } = await supabase
    .from("follows")
    .select("*")
    .eq("follower_id", user.id)
    .eq("followee_id", followeeId)
    .maybeSingle();

  if (existing) {
    await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", followeeId);
  } else {
    await supabase.from("follows").insert({ follower_id: user.id, followee_id: followeeId });
    await supabase.from("activity_events").insert({
      user_id: user.id,
      event_type: "followed",
      ref_id: followeeId,
    });
  }

  revalidatePath(`/profile/${followeeId}`);
}

const createListSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(true),
});

export async function createList(input: z.infer<typeof createListSchema>) {
  const { title, description, isPublic } = createListSchema.parse(input);
  const { supabase, user } = await requireUser();

  const { data: list, error } = await supabase
    .from("lists")
    .insert({ user_id: user.id, title, description, is_public: isPublic })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("activity_events").insert({
    user_id: user.id,
    event_type: "list_created",
    ref_id: list.id,
  });

  revalidatePath("/lists");
  return list.id as string;
}

export async function addToList(listId: string, titleId: string) {
  const { supabase } = await requireUser();
  const { data: existingItems } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1);

  const position = (existingItems?.[0]?.position ?? -1) + 1;
  await supabase.from("list_items").insert({ list_id: listId, title_id: titleId, position });
  revalidatePath(`/lists/${listId}`);
}
