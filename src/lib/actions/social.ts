"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
