"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
import { orderPair } from "@/lib/messages/pair";
import { validateMessageBody } from "@/lib/messages/validate";

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
 * Finds the existing 1:1 conversation with otherUserId, or creates it. The
 * unique constraint on the canonically-ordered (user_a, user_b) pair (see
 * migration 0014) means this is safe even under a race — if two inserts
 * both fire for the same pair, one wins and the other gets a conflict,
 * handled below by just re-fetching.
 */
export async function getOrCreateConversation(otherUserId: string): Promise<string> {
  const { supabase, user } = await requireUser();
  const [userA, userB] = orderPair(user.id, otherUserId);

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user_a: userA, user_b: userB })
    .select("id")
    .single();

  if (error) {
    // Conflict from a concurrent insert of the same pair — fetch what won.
    const { data: winner } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_a", userA)
      .eq("user_b", userB)
      .maybeSingle();
    if (winner) return winner.id;
    throw new Error(error.message);
  }

  return created.id as string;
}

export interface NewMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export async function sendMessage(conversationId: string, rawBody: string): Promise<NewMessage> {
  const validation = validateMessageBody(rawBody);
  if (!validation.ok) throw new Error(validation.error);
  const { supabase, user } = await requireUser();

  const { data: message, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, body: validation.body })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();
  if (error || !message) throw new Error(error?.message ?? "Failed to send message — is this your conversation?");

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
  return message;
}

// Called directly from /messages/[id]'s page render (not a form action),
// so it deliberately does NOT call revalidatePath — Next 16 disallows
// revalidating during a render pass ("Route ... used revalidatePath during
// render"), which was silently 500-ing every conversation page. Not needed
// anyway: this route reads cookies for auth, which already makes it fully
// dynamic, so every request re-fetches fresh data with no cache to
// invalidate.
export async function markConversationRead(conversationId: string) {
  const { supabase, user } = await requireUser();
  // Column-privileges (migration 0014) mean this update can only ever touch
  // read_at, regardless of what a caller passes — belt and suspenders on
  // top of the .neq("sender_id", ...) already scoping it to messages from
  // the other participant.
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", user.id)
    .is("read_at", null);
}
