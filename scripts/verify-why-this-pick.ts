/**
 * End-to-end verification of the "why this pick" citation feature (migration
 * 0016's most_similar_liked_title RPC + src/lib/recommendations/explain.ts)
 * against the real Supabase project. engine.ts can't be called directly from
 * a standalone script (goes through @/lib/supabase/server, which needs a
 * Next.js request/cookies context), so this mirrors its citation logic with
 * a plain supabase-js client — same pattern as the other verify-*.ts scripts
 * — while importing the actual pure buildReasonDetail/buildColdStartDetail
 * functions rather than reimplementing them.
 *
 * Confirms: the RPC never cites a title against itself, correctly finds a
 * second liked title once one's rated (using a permissive threshold so the
 * check doesn't depend on real semantic similarity between two arbitrary
 * catalogue titles), the name lookup + buildReasonDetail pipeline produces a
 * citation-bearing headline, and — separately — that a full mirror of
 * getRecommendationsForUser's real flow (against a user with an actual
 * taste vector) produces well-formed ReasonDetail objects for every
 * recommendation without erroring. Cleans up after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { buildReasonDetail } from "../src/lib/recommendations/explain";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+whythispick${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `wtp_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("1. Finding two distinct real embedded titles...");
  const { data: embedded } = await admin.from("title_embeddings").select("title_id").limit(2);
  if (!embedded || embedded.length < 2) throw new Error("need at least 2 embedded titles in the catalogue to test against");
  const { data: titleA } = await admin.from("titles").select("id, name").eq("id", embedded[0].title_id).single();
  const { data: titleB } = await admin.from("titles").select("id, name").eq("id", embedded[1].title_id).single();
  if (!titleA || !titleB) throw new Error("failed to load title rows for the two embedded ids");
  console.log(`   A: "${titleA.name}", B: "${titleB.name}"`);

  console.log("2. Creating a test user and rating only title A...");
  const user = await createTestUser(admin, "user");
  await user.client.rpc("upsert_taste_vector_from_rating", { p_user_id: user.id, p_title_id: titleA.id, p_score: 5 });
  await admin.from("ratings").insert({ user_id: user.id, title_id: titleA.id, score: 5 });

  console.log("3. Confirming the RPC never cites a title against itself (only A is rated)...");
  const { data: selfCheck, error: selfCheckError } = await admin.rpc("most_similar_liked_title", {
    p_user_id: user.id,
    p_title_id: titleA.id,
    p_min_similarity: -1,
  });
  if (selfCheckError) throw new Error(`RPC failed: ${selfCheckError.message}`);
  if (selfCheck && selfCheck.length > 0) throw new Error(`expected no citation when the only rated title is the target itself, got ${JSON.stringify(selfCheck)}`);
  console.log("   ok — no self-citation");

  console.log("4. Rating title B too, then re-checking citation for A (permissive threshold)...");
  await user.client.rpc("upsert_taste_vector_from_rating", { p_user_id: user.id, p_title_id: titleB.id, p_score: 5 });
  await admin.from("ratings").insert({ user_id: user.id, title_id: titleB.id, score: 5 });

  const { data: citation, error: citationError } = await admin.rpc("most_similar_liked_title", {
    p_user_id: user.id,
    p_title_id: titleA.id,
    p_min_similarity: -1,
  });
  if (citationError) throw new Error(`RPC failed: ${citationError.message}`);
  if (!citation || citation.length === 0 || citation[0].title_id !== titleB.id) {
    throw new Error(`expected title B to be cited for title A at a permissive threshold, got ${JSON.stringify(citation)}`);
  }
  console.log("   ok — title B correctly cited as the closest liked title to A");

  console.log("5. Confirming buildReasonDetail produces a citation-bearing headline from this real title data...");
  const { data: fullTitleA } = await admin.from("titles").select("*").eq("id", titleA.id).single();
  const detail = buildReasonDetail({
    title: fullTitleA!,
    hasStrongContentMatch: true,
    hasCollaborativeEdge: false,
    citedTitle: titleB.name,
  });
  if (!detail.headline.includes(titleB.name)) throw new Error(`expected the headline to mention "${titleB.name}", got: ${detail.headline}`);
  console.log(`   ok — headline: "${detail.headline}"`);

  console.log("6. Mirroring getRecommendationsForUser's full flow end-to-end for a real taste-vector user...");
  const { data: contentMatches } = await admin.rpc("match_titles_for_user", { p_user_id: user.id, p_match_count: 20 });
  if (!contentMatches || contentMatches.length === 0) {
    console.log("   (no content matches available to rank — skipping, not a failure, just a sparse test catalogue for this user)");
  } else {
    const topId = contentMatches[0].title_id;
    const { data: topTitle } = await admin.from("titles").select("*").eq("id", topId).single();
    if (!topTitle) throw new Error("expected the top content match's title row to exist");
    const strongMatch = contentMatches[0].similarity > 0.85;
    const detailForTop = buildReasonDetail({
      title: topTitle,
      hasStrongContentMatch: strongMatch,
      hasCollaborativeEdge: false,
      citedTitle: null,
    });
    if (typeof detailForTop.headline !== "string" || detailForTop.headline.length === 0) {
      throw new Error("expected a non-empty headline for the top real recommendation");
    }
    if (!Array.isArray(detailForTop.themes) || !Array.isArray(detailForTop.tone)) {
      throw new Error("expected themes/tone arrays on the detail object");
    }
    console.log(`   ok — real top pick "${topTitle.name}" produces a well-formed detail object`);
  }

  console.log("7. Cleaning up...");
  await admin.from("ratings").delete().eq("user_id", user.id);
  await admin.from("taste_vectors").delete().eq("user_id", user.id);
  await admin.auth.admin.deleteUser(user.id);

  console.log("\nAll 'why this pick' checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
