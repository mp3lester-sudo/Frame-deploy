"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { REVIEW_REACTIONS, type ReviewReaction } from "@/lib/constants/social";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/**
 * A user has at most one reaction per review (the review_reactions table's
 * primary key is (review_id, user_id) — see migration 0001), so this is a
 * single-select toggle: picking the reaction you already have clears it,
 * picking a different one swaps it, matching the ReviewReactionBar UI.
 */
export async function setReviewReaction(reviewId: string, reaction: ReviewReaction | null) {
  if (reaction !== null && !REVIEW_REACTIONS.includes(reaction)) throw new Error("Invalid reaction");
  const { supabase, user } = await requireUser();

  if (reaction === null) {
    await supabase.from("review_reactions").delete().eq("review_id", reviewId).eq("user_id", user.id);
  } else {
    await supabase.from("review_reactions").upsert({ review_id: reviewId, user_id: user.id, reaction });
  }

  const { data: review } = await supabase.from("reviews").select("title_id").eq("id", reviewId).maybeSingle();
  if (review?.title_id) revalidatePath(`/movie/${review.title_id}`);
}
