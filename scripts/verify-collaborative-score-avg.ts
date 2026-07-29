/**
 * End-to-end verification of migration 0021 (similar_users_liked: sum -> avg)
 * against the real Supabase project. The bug this fixes: summing
 * (rating/5 * closeness) across every taste-similar neighbor meant a title
 * liked by more neighbors scored higher regardless of how good a match it
 * actually is for the viewer — a popularity-among-neighbors bias baked into
 * a signal that's supposed to mean "people like you loved this."
 *
 * Builds one viewer and two neighbors with near-identical taste vectors
 * (rating the same handful of embedded titles the same way), then has a
 * target title get rated 5.0 by just the first neighbor, and confirms the
 * viewer's similar_users_liked score for it. Then has the SECOND neighbor
 * also rate that same title 5.0, and confirms the score does NOT roughly
 * double the way the old sum() would have — it should land close to where
 * it started, since an average of two very-similar (score, closeness) pairs
 * isn't meaningfully different from either alone. Cleans up after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+collab${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `collab_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("1. Finding embedded titles to build taste vectors with...");
  const { data: embedded } = await admin.from("title_embeddings").select("title_id").limit(10);
  if (!embedded || embedded.length < 6) {
    throw new Error(`need at least 6 embedded titles to run this, found ${embedded?.length ?? 0}`);
  }
  const sharedTitleIds = embedded.slice(0, 4).map((e) => e.title_id); // rated identically by everyone, to make closeness ~1
  const targetTitleId = embedded[4].title_id; // what neighbors will rate highly, viewer hasn't seen

  console.log("2. Creating a viewer and two near-identical-taste neighbors...");
  const viewer = await createTestUser(admin, "viewer");
  const neighborA = await createTestUser(admin, "neighborA");
  const neighborB = await createTestUser(admin, "neighborB");

  async function buildTasteVector(user: { id: string; client: SupabaseClient }) {
    for (const titleId of sharedTitleIds) {
      await user.client.from("ratings").upsert({ user_id: user.id, title_id: titleId, score: 4.5 });
      await user.client.rpc("upsert_taste_vector_from_rating", {
        p_user_id: user.id,
        p_title_id: titleId,
        p_score: 4.5,
      });
    }
  }
  await buildTasteVector(viewer);
  await buildTasteVector(neighborA);
  await buildTasteVector(neighborB);
  console.log("   ok — all three rated the same titles the same way (near-identical taste vectors)");

  console.log("3. Neighbor A rates the target title 5.0; checking the viewer's collaborative score for it...");
  await neighborA.client.from("ratings").upsert({ user_id: neighborA.id, title_id: targetTitleId, score: 5.0 });

  const { data: afterOne, error: e1 } = await viewer.client.rpc("similar_users_liked", {
    p_user_id: viewer.id,
    p_match_count: 50,
  });
  if (e1) throw new Error(`similar_users_liked failed: ${e1.message}`);
  const scoreAfterOne = afterOne?.find((r: { title_id: string; score: number }) => r.title_id === targetTitleId)?.score;
  if (scoreAfterOne == null) throw new Error("expected the target title to show up after one neighbor rated it");
  if (scoreAfterOne > 1) throw new Error(`expected an averaged score <= 1, got ${scoreAfterOne}`);
  console.log(`   ok — score after 1 neighbor: ${scoreAfterOne.toFixed(3)} (bounded, as expected of an average)`);

  console.log("4. Neighbor B ALSO rates the target title 5.0; confirming the score doesn't roughly double...");
  await neighborB.client.from("ratings").upsert({ user_id: neighborB.id, title_id: targetTitleId, score: 5.0 });

  const { data: afterTwo, error: e2 } = await viewer.client.rpc("similar_users_liked", {
    p_user_id: viewer.id,
    p_match_count: 50,
  });
  if (e2) throw new Error(`similar_users_liked failed: ${e2.message}`);
  const scoreAfterTwo = afterTwo?.find((r: { title_id: string; score: number }) => r.title_id === targetTitleId)?.score;
  if (scoreAfterTwo == null) throw new Error("expected the target title to still show up after a second neighbor rated it");

  const ratio = scoreAfterTwo / scoreAfterOne;
  console.log(`   score after 2 neighbors: ${scoreAfterTwo.toFixed(3)} (ratio vs. 1 neighbor: ${ratio.toFixed(2)}x)`);
  // A real average of two near-identical (score, closeness) pairs should be
  // close to 1x the original, not ~2x (what sum() would have produced).
  if (ratio > 1.5) {
    throw new Error(
      `expected a second agreeing neighbor to leave the score roughly where it was (avg), not scale it up ${ratio.toFixed(2)}x like the old sum() would have`
    );
  }
  console.log("   ok — a second agreeing neighbor did NOT inflate the score the way sum() used to");

  console.log("5. Cleaning up test users...");
  await admin.auth.admin.deleteUser(viewer.id);
  await admin.auth.admin.deleteUser(neighborA.id);
  await admin.auth.admin.deleteUser(neighborB.id);

  console.log("\nAll collaborative-score (avg, not sum) checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
