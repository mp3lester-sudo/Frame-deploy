/**
 * End-to-end verification of direct messages against the real Supabase
 * project (migration 0014). src/lib/actions/messages.ts can't be called
 * directly from a standalone script (goes through @/lib/supabase/server,
 * which needs a Next.js request/cookies context), so this mirrors its logic
 * with a plain supabase-js client — same pattern as the other verify-*.ts
 * scripts.
 *
 * Creates two conversation participants and an outsider. Confirms:
 * orderPair produces the same conversation regardless of who starts it,
 * getOrCreateConversation-equivalent logic is idempotent, both participants
 * can read/send messages, an outsider can't read or send into the
 * conversation (RLS), the recipient can mark a message read, and — the
 * important security check — a participant CANNOT rewrite the body of a
 * message via update (only read_at is grantable per migration 0014's
 * column-level GRANT, closing the gap RLS alone can't close since RLS is
 * row-scoped, not column-scoped). Cleans up after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { orderPair } from "../src/lib/messages/pair";
import { validateMessageBody } from "../src/lib/messages/validate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+dm${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `dm_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !created.user) throw new Error(`createUser failed for ${label}: ${error?.message}`);
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password });
  await admin.from("profiles").insert({ id: created.user.id, username, display_name: username });
  return { id: created.user.id, client };
}

async function main() {
  const admin = createServiceClient(url, serviceKey);

  console.log("1. Creating two participants and an outsider...");
  const alice = await createTestUser(admin, "alice");
  const bob = await createTestUser(admin, "bob");
  const outsider = await createTestUser(admin, "outsider");

  console.log("2. orderPair gives the same result regardless of who starts the conversation...");
  const [pairAB] = [orderPair(alice.id, bob.id)];
  const [pairBA] = [orderPair(bob.id, alice.id)];
  if (JSON.stringify(pairAB) !== JSON.stringify(pairBA)) throw new Error("orderPair should be symmetric");
  const [userA, userB] = pairAB;

  console.log("3. Alice starts the conversation...");
  const { data: conversation, error: convError } = await alice.client
    .from("conversations")
    .insert({ user_a: userA, user_b: userB })
    .select("id")
    .single();
  if (convError || !conversation) throw new Error(`conversation insert failed: ${convError?.message}`);

  console.log("4. Bob starting 'a new conversation' with Alice finds the same one (idempotency)...");
  const { data: existing } = await bob.client
    .from("conversations")
    .select("id")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .maybeSingle();
  if (existing?.id !== conversation.id) throw new Error("expected the same conversation id regardless of who looks it up");
  console.log("   ok — same conversation found from either side");

  console.log("5. Outsider can't see the conversation at all (RLS)...");
  const { data: convAsOutsider } = await outsider.client.from("conversations").select("id").eq("id", conversation.id).maybeSingle();
  if (convAsOutsider) throw new Error("expected the outsider to not see this conversation");
  console.log("   ok");

  console.log("6. Alice sends a message, Bob can read it...");
  const bodyResult = validateMessageBody("Hey Bob, want to watch something tonight?");
  if (!bodyResult.ok) throw new Error("unexpected validation failure");
  const { data: message, error: msgError } = await alice.client
    .from("messages")
    .insert({ conversation_id: conversation.id, sender_id: alice.id, body: bodyResult.body })
    .select("id")
    .single();
  if (msgError || !message) throw new Error(`message insert failed: ${msgError?.message}`);

  const { data: messagesAsBob } = await bob.client.from("messages").select("id, body").eq("conversation_id", conversation.id);
  if (!messagesAsBob?.some((m) => m.id === message.id)) throw new Error("expected Bob to see Alice's message");
  console.log("   ok — Bob can read Alice's message");

  console.log("7. Outsider can't read the message and can't send one into this conversation (RLS)...");
  const { data: messagesAsOutsider } = await outsider.client.from("messages").select("id").eq("conversation_id", conversation.id);
  if ((messagesAsOutsider ?? []).length !== 0) throw new Error("expected zero messages visible to the outsider");
  const { error: outsiderSendError } = await outsider.client
    .from("messages")
    .insert({ conversation_id: conversation.id, sender_id: outsider.id, body: "sneaking in" });
  if (!outsiderSendError) throw new Error("expected RLS to block the outsider from sending a message");
  console.log("   ok — outsider blocked from reading and sending");

  console.log("8. Bob marks the message read...");
  await bob.client
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversation.id)
    .neq("sender_id", bob.id)
    .is("read_at", null);
  const { data: afterRead } = await admin.from("messages").select("read_at").eq("id", message.id).single();
  if (!afterRead?.read_at) throw new Error("expected read_at to be set after Bob marked it read");
  console.log("   ok — read_at set");

  console.log("9. Bob CANNOT rewrite the message body via update (column grant restricts update to read_at only)...");
  const { error: forgeError } = await bob.client
    .from("messages")
    .update({ body: "rewritten by bob" })
    .eq("id", message.id);
  // With only read_at grantable, PostgREST/Postgres should reject this
  // (a permission error) rather than silently applying it.
  const { data: afterForgeAttempt } = await admin.from("messages").select("body").eq("id", message.id).single();
  if (afterForgeAttempt?.body !== bodyResult.body) throw new Error("SECURITY GAP: message body was rewritten by a non-sender!");
  if (!forgeError) {
    console.log("   note: update didn't error, but the body is confirmed unchanged (column grant held)");
  } else {
    console.log("   ok — update rejected outright, body unchanged");
  }

  console.log("10. Cleaning up...");
  await admin.from("conversations").delete().eq("id", conversation.id); // cascades to messages
  await admin.auth.admin.deleteUser(alice.id);
  await admin.auth.admin.deleteUser(bob.id);
  await admin.auth.admin.deleteUser(outsider.id);

  console.log("\nAll direct message checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
