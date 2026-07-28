/**
 * End-to-end verification that circumstantial context actually changes
 * recommendations, against the real Supabase project. src/lib/recommendations/
 * engine.ts can't be called directly from a standalone script (it goes
 * through @/lib/supabase/server, which needs a Next.js request/cookies
 * context), so this mirrors its exact blending + context-weighting logic
 * with a plain supabase-js client — same pattern as the other verify-*.ts
 * scripts — while importing the *actual* pure context-weighting functions
 * (no server dependency) rather than reimplementing them.
 *
 * Picks one real long title (>100 min) and one real short title (<=100 min)
 * from the catalogue, gives a fresh test user a taste vector via
 * upsert_taste_vector_from_rating, then confirms:
 *  1. something_short excludes the long title from the ranked candidate set.
 *  2. detectAutoContext resolves sensibly for a few fixed inputs (already
 *     unit-tested, but this confirms the export surface is what page.tsx
 *     actually imports).
 *  3. contextMultiplier(null) exclusions actually remove a title from a
 *     blended candidate map the same way engine.ts's filter does.
 * Cleans up after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { contextMultiplier } from "../src/lib/recommendations/context-weighting";
import { detectAutoContext, isCircumstantialContext } from "../src/lib/context/circumstantial";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+circumstantial${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `ctx_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("1. Finding a real long title (>100 min) and short title (<=100 min) that are both embedded...");
  const { data: embeddedIds } = await admin.from("title_embeddings").select("title_id").limit(2000);
  const idSet = new Set((embeddedIds ?? []).map((r) => r.title_id));

  const { data: longCandidates } = await admin
    .from("titles")
    .select("id, name, runtime_minutes")
    .gt("runtime_minutes", 100)
    .limit(500);
  const longTitle = (longCandidates ?? []).find((t) => idSet.has(t.id));
  if (!longTitle) throw new Error("no embedded long title found to test against");

  const { data: shortCandidates } = await admin
    .from("titles")
    .select("id, name, runtime_minutes")
    .lte("runtime_minutes", 100)
    .gt("runtime_minutes", 0)
    .limit(500);
  const shortTitle = (shortCandidates ?? []).find((t) => idSet.has(t.id));
  if (!shortTitle) throw new Error("no embedded short title found to test against");
  console.log(`   long: "${longTitle.name}" (${longTitle.runtime_minutes}min), short: "${shortTitle.name}" (${shortTitle.runtime_minutes}min)`);

  console.log("2. Creating a test user and building a real taste vector from a rating...");
  const user = await createTestUser(admin, "user");
  const { error: rpcError } = await user.client.rpc("upsert_taste_vector_from_rating", {
    p_user_id: user.id,
    p_title_id: longTitle.id,
    p_score: 4.5,
  });
  if (rpcError) throw new Error(`upsert_taste_vector_from_rating failed: ${rpcError.message}`);

  const { data: tasteVector } = await admin.from("taste_vectors").select("user_id, sample_size").eq("user_id", user.id).maybeSingle();
  if (!tasteVector) throw new Error("expected a taste_vectors row to exist after rating");
  console.log(`   ok — taste vector built (sample_size=${tasteVector.sample_size})`);

  console.log("3. Mirroring engine.ts's candidate-pool + context-weighting logic for 'something_short'...");
  const { data: contentMatches } = await admin.rpc("match_titles_for_user", { p_user_id: user.id, p_match_count: 30 });
  const blended = new Map<string, number>();
  for (const m of contentMatches ?? []) blended.set(m.title_id, m.similarity);

  // Force both known titles into the candidate pool so the test doesn't
  // depend on where they happen to land in real similarity ranking.
  blended.set(longTitle.id, blended.get(longTitle.id) ?? 0.5);
  blended.set(shortTitle.id, blended.get(shortTitle.id) ?? 0.5);

  const candidateIds = [...blended.keys()];
  const { data: candidateTitles } = await admin.from("titles").select("*").in("id", candidateIds);
  const byId = new Map((candidateTitles ?? []).map((t) => [t.id, t]));

  const survivingIds = new Set<string>();
  for (const id of candidateIds) {
    const title = byId.get(id);
    if (!title) continue;
    const multiplier = contextMultiplier(title, "something_short");
    if (multiplier !== null) survivingIds.add(id);
  }

  if (survivingIds.has(longTitle.id)) throw new Error(`expected the long title to be excluded by something_short, but it survived`);
  if (!survivingIds.has(shortTitle.id)) throw new Error(`expected the short title to survive something_short`);
  console.log("   ok — something_short correctly excludes the long title and keeps the short one");

  console.log("4. Confirming 'solo' context excludes nothing (multiplier always 1)...");
  for (const id of candidateIds) {
    const title = byId.get(id);
    if (!title) continue;
    if (contextMultiplier(title, "solo") !== 1) throw new Error(`expected solo to be a no-op multiplier for ${id}`);
  }
  console.log("   ok — solo applies no filtering");

  console.log("5. Confirming the auto-detect + validity-check exports page.tsx relies on behave sanely...");
  if (detectAutoContext({ hour: 2, dayOfWeek: 3 }) !== "background") throw new Error("expected late night to auto-detect as background");
  if (!isCircumstantialContext("date_night")) throw new Error("expected date_night to be recognized as valid");
  if (isCircumstantialContext("literally anything else")) throw new Error("expected garbage input to be rejected");
  console.log("   ok — auto-detection and validation both behave as page.tsx expects");

  console.log("6. Cleaning up...");
  await admin.from("taste_vectors").delete().eq("user_id", user.id);
  await admin.auth.admin.deleteUser(user.id);

  console.log("\nAll circumstantial recommendation checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
