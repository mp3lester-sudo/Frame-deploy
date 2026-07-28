/**
 * End-to-end verification of review comments against the real Supabase
 * project (migration 0012). src/lib/actions/comments.ts can't be called
 * directly from a standalone script (goes through @/lib/supabase/server,
 * which needs a Next.js request/cookies context), so this mirrors its logic
 * with a plain supabase-js client — same pattern as the other verify-*.ts
 * scripts.
 *
 * Creates a review author and a commenter, has the commenter post a
 * comment, confirms it's publicly readable, confirms a third party can't
 * post a comment as someone else (RLS), confirms the commenter can delete
 * their own comment but the author can't delete someone else's, and
 * confirms an empty/oversized body is rejected by validateCommentBody
 * before ever reaching the database. Cleans up after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { validateCommentBody, MAX_COMMENT_LENGTH } from "../src/lib/comments/validate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+comments${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `cmt_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("1. Validating validateCommentBody rejects bad input before touching the DB...");
  if (validateCommentBody("").ok) throw new Error("expected empty comment to be rejected");
  if (validateCommentBody("   ").ok) throw new Error("expected whitespace-only comment to be rejected");
  if (validateCommentBody("a".repeat(MAX_COMMENT_LENGTH + 1)).ok) throw new Error("expected oversized comment to be rejected");
  console.log("   ok — validation catches bad input client-side");

  console.log("2. Creating a review author and a commenter...");
  const author = await createTestUser(admin, "author");
  const commenter = await createTestUser(admin, "commenter");

  console.log("3. Picking a real catalogue title and writing a review on it...");
  const { data: title } = await author.client.from("titles").select("id").limit(1).single();
  if (!title) throw new Error("no titles in catalogue to test against");

  const { data: review, error: reviewError } = await author.client
    .from("reviews")
    .insert({ user_id: author.id, title_id: title.id, body: "A test review for comment verification.", contains_spoilers: false })
    .select("id")
    .single();
  if (reviewError || !review) throw new Error(`review insert failed: ${reviewError?.message}`);

  console.log("4. Commenter posts a comment...");
  const validated = validateCommentBody("Totally agree with this take.");
  if (!validated.ok) throw new Error("unexpected validation failure");
  const { data: comment, error: commentError } = await commenter.client
    .from("review_comments")
    .insert({ review_id: review.id, user_id: commenter.id, body: validated.body })
    .select("id")
    .single();
  if (commentError || !comment) throw new Error(`comment insert failed: ${commentError?.message}`);

  console.log("5. Confirming the comment is publicly readable by the review author...");
  const { data: commentsAsAuthor } = await author.client
    .from("review_comments")
    .select("id, body, user_id")
    .eq("review_id", review.id);
  if (!commentsAsAuthor?.some((c) => c.id === comment.id)) throw new Error("expected author to see the commenter's comment");
  console.log("   ok — comment is publicly visible");

  console.log("6. Confirming the author can't post a comment impersonating the commenter (RLS)...");
  const { error: forgeError } = await author.client
    .from("review_comments")
    .insert({ review_id: review.id, user_id: commenter.id, body: "forged" });
  if (!forgeError) throw new Error("expected RLS to block inserting a comment on someone else's behalf");
  console.log("   ok — RLS blocks posting as another user");

  console.log("7. Confirming the author can't delete the commenter's comment (RLS)...");
  await author.client.from("review_comments").delete().eq("id", comment.id);
  const { data: stillThere } = await admin.from("review_comments").select("id").eq("id", comment.id).maybeSingle();
  if (!stillThere) throw new Error("expected the comment to survive the author's delete attempt (RLS should block it)");
  console.log("   ok — RLS blocks deleting someone else's comment");

  console.log("8. Confirming the commenter CAN delete their own comment...");
  await commenter.client.from("review_comments").delete().eq("id", comment.id).eq("user_id", commenter.id);
  const { data: goneNow } = await admin.from("review_comments").select("id").eq("id", comment.id).maybeSingle();
  if (goneNow) throw new Error("expected the commenter's own delete to succeed");
  console.log("   ok — owner can delete their own comment");

  console.log("9. Cleaning up...");
  await author.client.from("reviews").delete().eq("id", review.id);
  await admin.auth.admin.deleteUser(author.id);
  await admin.auth.admin.deleteUser(commenter.id);

  console.log("\nAll review comment checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
