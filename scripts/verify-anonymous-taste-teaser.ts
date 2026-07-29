/**
 * End-to-end verification of the pre-signup taste teaser -> signup seeding
 * flow, against the real Supabase project. Mirrors claimAnonymousSwipes()
 * (src/lib/actions/auth.ts) with a plain supabase-js client rather than
 * calling it directly, since that function (like the other server actions)
 * goes through @/lib/supabase/server's cookies()-based client, which only
 * works inside an actual Next.js request — same constraint as the other
 * verify-*.ts scripts in this project.
 *
 * Confirms: a batch of "anonymous swipes" applied right after account
 * creation produces real ratings + watch_history rows and seeds a
 * taste_vectors row (proving the very first home page load would be
 * personalized, not a cold-start fallback). Cleans up the test user after.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const admin = createServiceClient(url, serviceKey);

  console.log("1. Picking a few real titles to simulate anonymous swipes against...");
  const { data: sampleTitles, error: titlesError } = await admin
    .from("titles")
    .select("id, name")
    .order("tmdb_vote_count", { ascending: false })
    .limit(3);
  if (titlesError || !sampleTitles?.length) throw new Error(`Could not fetch sample titles: ${titlesError?.message}`);
  console.log(`   using: ${sampleTitles.map((t) => t.name).join(", ")}`);

  const swipes = [
    { titleId: sampleTitles[0].id, score: 5 },
    { titleId: sampleTitles[1].id, score: 5 },
    { titleId: sampleTitles[2].id, score: 1 },
  ];

  console.log("2. Creating a test user (simulating a brand-new signup)...");
  const testEmail = `mp3lester+teasertest${Date.now()}@gmail.com`;
  const testUsername = `teaser_${Date.now()}`.slice(0, 20);
  const password = "TestPassword123!";
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: testEmail,
    password,
    email_confirm: true,
    user_metadata: { username: testUsername },
  });
  if (createError || !created.user) throw new Error(`admin.createUser failed: ${createError?.message}`);
  const userId = created.user.id;
  await admin.from("profiles").insert({ id: userId, username: testUsername, display_name: testUsername });
  console.log(`   user created: ${userId}`);

  console.log("3. Signing in as that user (to exercise this as real authenticated RLS writes,");
  console.log("   exactly like claimAnonymousSwipes does inside the real signUp() action)...");
  const asUser = createClient(url, anonKey);
  const { error: signInError } = await asUser.auth.signInWithPassword({ email: testEmail, password });
  if (signInError) throw new Error(`signInWithPassword failed: ${signInError.message}`);

  console.log("4. Applying the swipes (same writes as claimAnonymousSwipes)...");
  for (const { titleId, score } of swipes) {
    const { error: ratingError } = await asUser.from("ratings").upsert({ user_id: userId, title_id: titleId, score });
    if (ratingError) throw new Error(`ratings upsert failed: ${ratingError.message}`);
    const { error: watchError } = await asUser.from("watch_history").upsert({ user_id: userId, title_id: titleId });
    if (watchError) throw new Error(`watch_history upsert failed: ${watchError.message}`);
    const { error: rpcError } = await asUser.rpc("upsert_taste_vector_from_rating", {
      p_user_id: userId,
      p_title_id: titleId,
      p_score: score,
    });
    if (rpcError) throw new Error(`upsert_taste_vector_from_rating failed: ${rpcError.message}`);
  }

  console.log("5. Confirming ratings + watch_history rows exist for all 3 swipes...");
  const { data: ratingRows } = await admin.from("ratings").select("title_id, score").eq("user_id", userId);
  const { data: watchRows } = await admin.from("watch_history").select("title_id").eq("user_id", userId);
  if ((ratingRows?.length ?? 0) !== 3) throw new Error(`Expected 3 ratings, got ${ratingRows?.length}`);
  if ((watchRows?.length ?? 0) !== 3) throw new Error(`Expected 3 watch_history rows, got ${watchRows?.length}`);
  console.log("   OK.");

  console.log("6. Confirming a taste_vectors row now exists (this is what turns off cold-start");
  console.log("   fallback recommendations for this brand-new account)...");
  const { data: vectorRow } = await admin.from("taste_vectors").select("user_id").eq("user_id", userId).maybeSingle();
  if (!vectorRow) throw new Error("No taste_vectors row was seeded — cold-start would NOT be avoided!");
  console.log("   OK — taste vector seeded from swipes alone, before any post-signup rating.");

  console.log("7. Cleaning up test user...");
  await admin.auth.admin.deleteUser(userId); // cascades ratings/watch_history/taste_vectors/profile

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error("VERIFICATION FAILED:", err.message);
  process.exit(1);
});
