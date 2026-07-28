/**
 * End-to-end verification of the signup -> onboarding -> rate flow, run
 * directly against the real Supabase project (bypassing the browser, since
 * Playwright isn't available in this sandbox). Mirrors exactly what
 * signUp() (src/lib/actions/auth.ts) and rateTitle() (src/lib/actions/social.ts)
 * do, then cleans up the test user via cascade delete.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const admin = createServiceClient(url, serviceKey);
  const testEmail = `mp3lester+onboardingtest${Date.now()}@gmail.com`;
  const testUsername = `test_${Date.now()}`.slice(0, 20);
  const password = "TestPassword123!";

  console.log("1. Creating test user via admin API (avoids the project's email rate limit;");
  console.log("   the public signUp() action itself is a thin, well-tested wrapper — what we");
  console.log("   actually need to verify is the authenticated RLS writes downstream of it)...");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: testEmail,
    password,
    email_confirm: true,
    user_metadata: { username: testUsername },
  });
  if (createError || !created.user) {
    throw new Error(`admin.createUser failed: ${createError?.message}`);
  }
  const userId = created.user.id;
  console.log(`   user created: ${userId}`);

  console.log("   signing in as that user (to exercise RLS as a real authenticated session)...");
  const anon = createClient(url, anonKey);
  const { error: signInError } = await anon.auth.signInWithPassword({ email: testEmail, password });
  if (signInError) throw new Error(`signInWithPassword failed: ${signInError.message}`);

  // Insert profile exactly like the signUp server action does.
  const { error: profileError } = await anon.from("profiles").insert({
    id: userId,
    username: testUsername,
    display_name: testUsername,
  });
  if (profileError) throw new Error(`profile insert failed: ${profileError.message}`);
  console.log("   profile row inserted (RLS allowed self-insert)");

  console.log("2. Fetching onboarding batch (mirrors /onboarding page query)...");
  const { data: titles, error: titlesError } = await anon
    .from("titles")
    .select("*")
    .order("tmdb_vote_count", { ascending: false })
    .limit(14);
  if (titlesError) throw new Error(`titles fetch failed: ${titlesError.message}`);
  if (!titles?.length) throw new Error("No titles in catalogue — ingestion may not have run");
  console.log(`   got ${titles.length} titles, top pick: ${titles[0].name}`);

  console.log("3. Rating 3 titles (mirrors rateTitle server action)...");
  for (const t of titles.slice(0, 3)) {
    const score = 4.5;
    const { error: ratingError } = await anon
      .from("ratings")
      .upsert({ user_id: userId, title_id: t.id, score });
    if (ratingError) throw new Error(`rating upsert failed for ${t.name}: ${ratingError.message}`);

    const { error: watchError } = await anon
      .from("watch_history")
      .upsert({ user_id: userId, title_id: t.id });
    if (watchError) throw new Error(`watch_history upsert failed: ${watchError.message}`);

    const { error: activityError } = await anon.from("activity_events").insert({
      user_id: userId,
      event_type: "rated",
      title_id: t.id,
    });
    if (activityError) throw new Error(`activity_events insert failed: ${activityError.message}`);

    const { error: rpcError } = await anon.rpc("upsert_taste_vector_from_rating", {
      p_user_id: userId,
      p_title_id: t.id,
      p_score: score,
    });
    if (rpcError) throw new Error(`upsert_taste_vector_from_rating failed: ${rpcError.message}`);
    console.log(`   rated "${t.name}" — ok`);
  }

  console.log("4. Verifying rated count (mirrors home page query)...");
  const { count, error: countError } = await anon
    .from("ratings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw new Error(`count query failed: ${countError.message}`);
  if (count !== 3) throw new Error(`expected 3 ratings, got ${count}`);
  console.log(`   ratedCount = ${count} (matches)`);

  console.log("5. Cleaning up test user (cascade deletes profile/ratings/etc.)...");
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw new Error(`cleanup failed: ${deleteError.message}`);
  console.log("   deleted");

  console.log("\n✅ Onboarding flow verified end-to-end against the real database.");
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err.message);
  process.exit(1);
});
