/**
 * End-to-end verification of the Hot Takes feed's query + ranking against
 * the real Supabase project. Mirrors src/app/hot-takes/page.tsx's exact
 * queries with a plain supabase-js client (a page.tsx can't be invoked
 * directly from a script), then runs the real rankByControversy() against
 * the fetched rows — same pattern as the other verify-*.ts scripts.
 *
 * Creates a review with two disagree reactions and a quieter review with a
 * single agree reaction, confirms the spicy one ranks first and the quiet
 * one is excluded entirely (zero score), then confirms the ranked review's
 * title/author join data needed by the page is actually present. Cleans up
 * after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { rankByControversy } from "../src/lib/reactions/rank";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+hottakes${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `hot_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("1. Creating an author and two reactors...");
  const author = await createTestUser(admin, "author");
  const reactorA = await createTestUser(admin, "reactora");
  const reactorB = await createTestUser(admin, "reactorb");

  console.log("2. Picking a real title and writing a spicy + a quiet review...");
  const { data: title } = await author.client.from("titles").select("id, name").limit(1).single();
  if (!title) throw new Error("no titles in catalogue to test against");

  const { data: spicyReview, error: spicyError } = await author.client
    .from("reviews")
    .insert({ user_id: author.id, title_id: title.id, body: "This is an unpopular opinion.", contains_spoilers: false })
    .select("id")
    .single();
  if (spicyError || !spicyReview) throw new Error(`spicy review insert failed: ${spicyError?.message}`);

  const { data: quietReview, error: quietError } = await author.client
    .from("reviews")
    .insert({ user_id: author.id, title_id: title.id, body: "A perfectly agreeable take.", contains_spoilers: false })
    .select("id")
    .single();
  if (quietError || !quietReview) throw new Error(`quiet review insert failed: ${quietError?.message}`);

  console.log("3. Reacting: two disagrees on the spicy review, one agree on the quiet one...");
  await reactorA.client.from("review_reactions").upsert({ review_id: spicyReview.id, user_id: reactorA.id, reaction: "disagree" });
  await reactorB.client.from("review_reactions").upsert({ review_id: spicyReview.id, user_id: reactorB.id, reaction: "hot_take" });
  await reactorA.client.from("review_reactions").upsert({ review_id: quietReview.id, user_id: reactorA.id, reaction: "agree" });

  console.log("4. Running the page's exact query shape...");
  const { data: reviews, error: reviewsQueryError } = await author.client
    .from("reviews")
    .select("id, user_id, title_id, body, contains_spoilers, created_at, profiles!reviews_user_id_fkey(username, avatar_url), titles(id, name, poster_url)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (reviewsQueryError) throw new Error(`reviews query failed: ${reviewsQueryError.message}`);
  if (!reviews) throw new Error("expected reviews query to return rows");

  const reviewIds = reviews.map((r) => r.id);
  const { data: reactionRows } = await author.client
    .from("review_reactions")
    .select("review_id, reaction, user_id")
    .in("review_id", reviewIds);

  console.log("4b. Confirming each reviewer's rating is fetchable separately (no FK links reviews to ratings)...");
  const reviewerIds = [...new Set(reviews.map((r) => r.user_id))];
  const reviewedTitleIds = [...new Set(reviews.map((r) => r.title_id))];
  const { data: ratingRows, error: ratingsError } = await author.client
    .from("ratings")
    .select("user_id, title_id, score")
    .in("user_id", reviewerIds)
    .in("title_id", reviewedTitleIds);
  if (ratingsError) throw new Error(`ratings query failed: ${ratingsError.message}`);
  console.log(`   ok — ${ratingRows?.length ?? 0} matching ratings fetched without error`);

  const ranked = rankByControversy(reviewIds, reactionRows ?? []);
  const rankedIds = ranked.map((r) => r.reviewId);

  if (rankedIds[0] !== spicyReview.id) {
    throw new Error(`expected the spicy review to rank first, got ranking: ${JSON.stringify(rankedIds.slice(0, 3))}`);
  }
  if (rankedIds.includes(quietReview.id)) {
    throw new Error("expected the quiet review (agree-only) to be excluded from the ranking entirely");
  }
  console.log("   ok — spicy review ranked first, quiet review excluded");

  console.log("5. Confirming the join data the page needs (title name, author) is present...");
  const spicyRow = reviews.find((r) => r.id === spicyReview.id);
  const joinedTitle = (spicyRow as unknown as { titles: { name: string } | null } | undefined)?.titles;
  const joinedProfile = (spicyRow as unknown as { profiles: { username: string } | null } | undefined)?.profiles;
  if (joinedTitle?.name !== title.name) throw new Error("expected the joined title name to match");
  if (joinedProfile?.username !== author.id && !joinedProfile?.username) throw new Error("expected a joined author username");
  console.log("   ok — title and author join data present");

  console.log("6. Cleaning up...");
  await author.client.from("reviews").delete().in("id", [spicyReview.id, quietReview.id]);
  await admin.auth.admin.deleteUser(author.id);
  await admin.auth.admin.deleteUser(reactorA.id);
  await admin.auth.admin.deleteUser(reactorB.id);

  console.log("\nAll Hot Takes checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
