/**
 * End-to-end verification of Matchmaking against the real Supabase project:
 * two test users rate the same set of real Horror titles the same way
 * (should score highly compatible), then a third user rates them the
 * opposite way (should score low). Replicates the exact query shape
 * computeCompatibilityForUsers() uses. Cleans up after itself.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { computeCompatibility, type UserTasteSignal } from "../src/lib/matchmaking/scoring";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeTestUser(admin: any, label: string) {
  const email = `mp3lester+match${label}${Date.now()}@gmail.com`;
  const username = `mm_${label}_${Date.now()}`.slice(0, 20);
  const password = "TestPassword123!";

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !created.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);

  const client = createClient(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn(${label}) failed: ${signInError.message}`);

  const { error: profileError } = await client.from("profiles").insert({ id: created.user.id, username, display_name: username });
  if (profileError) throw new Error(`profile insert(${label}) failed: ${profileError.message}`);

  return { client, userId: created.user.id, username };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildSignal(client: any, userId: string): Promise<UserTasteSignal> {
  const [{ data: attrs }, { data: vector }, { data: ratings }] = await Promise.all([
    client.from("taste_attributes").select("favorite_genres, favorite_directors").eq("user_id", userId).maybeSingle(),
    client.from("taste_vectors").select("embedding").eq("user_id", userId).maybeSingle(),
    client.from("ratings").select("title_id, score").eq("user_id", userId),
  ]);

  const ratingsById: Record<string, number> = {};
  for (const r of ratings ?? []) ratingsById[r.title_id] = r.score;

  const titleIds = Object.keys(ratingsById);
  const { data: titles }: { data: { id: string; genres: string[] }[] | null } = titleIds.length
    ? await client.from("titles").select("id, genres").in("id", titleIds)
    : { data: [] };
  const genresByTitle = new Map((titles ?? []).map((t) => [t.id, t.genres ?? []]));

  const genreSentiment: UserTasteSignal["genreSentiment"] = {};
  for (const [titleId, score] of Object.entries(ratingsById)) {
    const weight = (score - 2.5) / 2.5;
    for (const g of genresByTitle.get(titleId) ?? []) {
      const entry = genreSentiment[g] ?? { sum: 0, count: 0 };
      entry.sum += weight;
      entry.count += 1;
      genreSentiment[g] = entry;
    }
  }

  return {
    genreSentiment,
    embedding: vector?.embedding ?? null,
    ratingsById,
    favoriteGenres: attrs?.favorite_genres ?? [],
    favoriteDirectorIds: attrs?.favorite_directors ?? [],
  };
}

async function main() {
  const admin = createServiceClient(url, serviceKey);

  console.log("1. Creating three test users (twin, opposite, control)...");
  const twinA = await makeTestUser(admin, "twina");
  const twinB = await makeTestUser(admin, "twinb");
  const opposite = await makeTestUser(admin, "opp");
  console.log(`   ${twinA.username}, ${twinB.username}, ${opposite.username}`);

  console.log("2. Fetching real Horror titles to rate...");
  const { data: horror } = await twinA.client.from("titles").select("id, name").contains("genres", ["Horror"]).limit(5);
  if (!horror || horror.length < 4) throw new Error("Not enough Horror titles in catalogue for this test");

  console.log("3. twinA and twinB both love the same 5 Horror titles; opposite hates them...");
  for (const t of horror) {
    await twinA.client.from("ratings").upsert({ user_id: twinA.userId, title_id: t.id, score: 5 });
    await twinB.client.from("ratings").upsert({ user_id: twinB.userId, title_id: t.id, score: 4.5 });
    await opposite.client.from("ratings").upsert({ user_id: opposite.userId, title_id: t.id, score: 0.5 });
  }

  console.log("4. Building signals the same way computeCompatibilityForUsers() does...");
  const signalA = await buildSignal(twinA.client, twinA.userId);
  const signalB = await buildSignal(twinB.client, twinB.userId);
  const signalOpp = await buildSignal(opposite.client, opposite.userId);

  const twinsResult = computeCompatibility(signalA, signalB);
  const oppositeResult = computeCompatibility(signalA, signalOpp);

  console.log(`   twinA <-> twinB: ${twinsResult.percent}% (expected high)`);
  console.log(`   twinA <-> opposite: ${oppositeResult.percent}% (expected low)`);

  if (twinsResult.percent < 85) throw new Error(`expected twins to score >85%, got ${twinsResult.percent}`);
  if (oppositeResult.percent > 20) throw new Error(`expected opposites to score <20%, got ${oppositeResult.percent}`);
  if (twinsResult.commonRatedCount !== horror.length) {
    throw new Error(`expected ${horror.length} common rated titles, got ${twinsResult.commonRatedCount}`);
  }

  console.log("5. Cleaning up test users...");
  await admin.auth.admin.deleteUser(twinA.userId);
  await admin.auth.admin.deleteUser(twinB.userId);
  await admin.auth.admin.deleteUser(opposite.userId);
  console.log("   deleted");

  console.log("\n✅ Matchmaking verified end-to-end against the real database.");
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err.message);
  process.exit(1);
});
