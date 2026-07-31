"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
import { validateCommentBody } from "@/lib/comments/validate";
import { notify } from "@/lib/actions/notifications";

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

export interface NewComment {
  id: string;
  review_id: string;
  user_id: string;
  body: string;
  created_at: string;
  username: string;
  avatar_url: string | null;
}

export async function addComment(reviewId: string, rawBody: string): Promise<NewComment> {
  const validation = validateCommentBody(rawBody);
  if (!validation.ok) throw new Error(validation.error);
  const { supabase, user } = await requireUser();

  const { data: comment, error } = await supabase
    .from("review_comments")
    .insert({ review_id: reviewId, user_id: user.id, body: validation.body })
    .select("id, review_id, user_id, body, created_at")
    .single();
  if (error || !comment) throw new Error(error?.message ?? "Failed to add comment");

  const { data: profile } = await supabase.from("profiles").select("username, avatar_url").eq("id", user.id).maybeSingle();

  const { data: review } = await supabase.from("reviews").select("title_id, user_id").eq("id", reviewId).maybeSingle();
  if (review?.title_id) revalidatePath(`/movie/${review.title_id}`);
  if (review?.user_id) {
    await notify(supabase, {
      recipientId: review.user_id,
      actorId: user.id,
      type: "comment",
      titleId: review.title_id,
      refId: reviewId,
    });
  }

  return { ...comment, username: profile?.username ?? "you", avatar_url: profile?.avatar_url ?? null };
}

export async function deleteComment(commentId: string) {
  const { supabase, user } = await requireUser();

  const { data: comment } = await supabase.from("review_comments").select("review_id").eq("id", commentId).maybeSingle();
  await supabase.from("review_comments").delete().eq("id", commentId).eq("user_id", user.id);

  if (comment?.review_id) {
    const { data: review } = await supabase.from("reviews").select("title_id").eq("id", comment.review_id).maybeSingle();
    if (review?.title_id) revalidatePath(`/movie/${review.title_id}`);
  }
}
