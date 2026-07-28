/**
 * End-to-end verification of review reactions against the real Supabase
 * project. src/lib/actions/reactions.ts can't be called directly from a
 * standalone script (goes through @/lib/supabase/server, which needs a
 * Next.js request/cookies context), so this mirrors its logic with a plain
 * supabase-js client — same pattern as the other verify-*.ts scripts.
 *
 * Creates a test user, has them write a review on a real catalogue title,
 * has a second test user react to it, confirms the reaction is public
 * (readable by a third party), confirms swapping reactions replaces rather
 * than adds a second row (the PK is (review_id, user_id) — one reaction per
 * person), confirms aggregateReactions produces the right summary from the
 * real fetched rows, and confirms clearing a reaction actually deletes it.
 * Cleans up after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { aggregateReactions } from "../src/lib/reactions/aggregate";
import { REVIEW_REACTIONS } from "../src/lib/constants/social";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+reactions${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `react_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("1. Creating a review author and a reactor...");
  const author = await createTestUser(admin, "author");
  const reactor = await createTestUser(admin, "reactor");

  console.log("2. Picking a real catalogue title and writing a review on it...");
  const { data: title } = await author.client.from("titles").select("id").limit(1).single();
  if (!title) throw new Error("no titles in catalogue to test against");

  const { data: review, error: reviewError } = await author.client
    .from("reviews")
    .insert({ user_id: author.id, title_id: title.id, body: "A test review for reaction verification.", contains_spoilers: false })
    .select("id")
    .single();
  if (reviewError || !review) throw new Error(`review insert failed: ${reviewError?.message}`);

  console.log("3. Reactor reacts 'agree'...");
  const { error: reactError } = await reactor.client
    .from("review_reactions")
    .upsert({ review_id: review.id, user_id: reactor.id, reaction: "agree" });
  if (reactError) throw new Error(`reaction upsert failed: ${reactError.message}`);

  console.log("4. Confirming the reaction is publicly readable by a third party...");
  const { data: rowsAsAuthor } = await author.client
    .from("review_reactions")
    .select("review_id, reaction, user_id")
    .eq("review_id", review.id);
  if (!rowsAsAuthor?.some((r) => r.user_id === reactor.id && r.reaction === "agree")) {
    throw new Error("expected the author to be able to see the reactor's reaction (reactions are public)");
  }
  console.log("   ok — reaction is publicly visible");

  console.log("4b. Confirming the movie detail page's own reviews query still resolves cleanly...");
  // review_reactions creates a second join path from reviews to profiles
  // (direct authorship vs. indirectly via reactions), which broke
  // src/app/movie/[id]/page.tsx's bare `profiles(...)` embed the moment a
  // review actually had a reaction on it — exactly the state this script
  // is in by this point. The !reviews_user_id_fkey hint is the fix; this
  // guards against that regression coming back.
  const { data: moviePageShapedReviews, error: moviePageQueryError } = await author.client
    .from("reviews")
    .select("*, profiles!reviews_user_id_fkey(username, avatar_url)")
    .eq("title_id", title.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (moviePageQueryError) throw new Error(`movie page reviews query regressed: ${moviePageQueryError.message}`);
  if (!moviePageShapedReviews?.some((r) => r.id === review.id)) throw new Error("expected our review in the movie page query's results");
  console.log("   ok — disambiguated query still resolves with a real reaction present");

  console.log("5. Aggregating the fetched rows with the real aggregateReactions()...");
  const summary = aggregateReactions(rowsAsAuthor ?? [], reactor.id).get(review.id);
  if (!summary || summary.counts.agree !== 1 || summary.myReaction !== "agree") {
    throw new Error(`aggregateReactions produced an unexpected summary: ${JSON.stringify(summary)}`);
  }
  for (const r of REVIEW_REACTIONS) {
    if (r !== "agree" && summary.counts[r] !== 0) throw new Error(`expected ${r} count to be 0`);
  }
  console.log("   ok — aggregated summary matches (1 agree, viewer's own reaction correctly identified)");

  console.log("6. Reactor swaps to 'disagree' (should replace, not add a second row)...");
  await reactor.client.from("review_reactions").upsert({ review_id: review.id, user_id: reactor.id, reaction: "disagree" });
  const { data: rowsAfterSwap, count } = await author.client
    .from("review_reactions")
    .select("reaction", { count: "exact" })
    .eq("review_id", review.id);
  if (count !== 1) throw new Error(`expected exactly 1 reaction row after swapping, got ${count}`);
  if (rowsAfterSwap?.[0]?.reaction !== "disagree") throw new Error("expected the row to now read 'disagree'");
  console.log("   ok — swapping reactions replaced the row rather than adding a second one");

  console.log("7. Reactor clears their reaction...");
  await reactor.client.from("review_reactions").delete().eq("review_id", review.id).eq("user_id", reactor.id);
  const { count: countAfterClear } = await author.client
    .from("review_reactions")
    .select("*", { count: "exact", head: true })
    .eq("review_id", review.id);
  if (countAfterClear !== 0) throw new Error(`expected 0 reactions after clearing, got ${countAfterClear}`);
  console.log("   ok — clearing a reaction actually deletes the row");

  console.log("8. Confirming a third party can't set someone else's reaction (RLS)...");
  const { error: forgeError } = await author.client
    .from("review_reactions")
    .upsert({ review_id: review.id, user_id: reactor.id, reaction: "agree" });
  if (!forgeError) throw new Error("expected RLS to block the author from writing a reaction as the reactor");
  console.log("   ok — RLS blocks writing a reaction on someone else's behalf");

  console.log("9. Cleaning up...");
  await author.client.from("reviews").delete().eq("id", review.id);
  await admin.auth.admin.deleteUser(author.id);
  await admin.auth.admin.deleteUser(reactor.id);

  console.log("\nAll review reaction checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
