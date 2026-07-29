/**
 * End-to-end verification of taste evolution (src/lib/taste-dna/evolution.ts
 * + its wiring into compute.ts) against the real Supabase project.
 * computeTasteDna() can't be called directly from a standalone script (goes
 * through @/lib/supabase/server, which needs Next.js request/cookies
 * context), so this mirrors its query + assembly logic with a plain
 * supabase-js client — same pattern as the other verify-*.ts scripts —
 * while importing the actual pure computeTasteEvolution function rather
 * than reimplementing it.
 *
 * Two checks: (1) a synthetic, fully-controlled scenario (rate old titles
 * one way, new titles a deliberately different way) to confirm the
 * chronological split + diffing actually detects a real shift end-to-end
 * through the DB wiring, not just in the already-unit-tested pure function;
 * (2) runs the same wiring against whichever real account has the most
 * rating history, just to confirm it doesn't error on real, messy data.
 * Cleans up its own synthetic data.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { computeTasteEvolution, type RatedTitleFeaturesWithTime } from "../src/lib/taste-dna/evolution";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+evolution${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `evo_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

/** Mirrors compute.ts's query + assembly, minus the taste_attributes write. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadRatedFeatures(admin: SupabaseClient<any>, userId: string): Promise<RatedTitleFeaturesWithTime[]> {
  const { data: ratings } = await admin.from("ratings").select("title_id, score, created_at").eq("user_id", userId);
  if (!ratings?.length) return [];

  const titleIds = ratings.map((r: { title_id: string }) => r.title_id);
  const { data: titles } = await admin
    .from("titles")
    .select("id, genres, tone, themes, mood_tags, pacing, violence_level, comedy_level, emotional_intensity, release_date, original_language")
    .in("id", titleIds);
  const titleById = new Map((titles ?? []).map((t: { id: string }) => [t.id, t]));

  return ratings
    .map((r: { title_id: string; score: number; created_at: string }) => {
      const title = titleById.get(r.title_id);
      if (!title) return null;
      return {
        weight: Math.max(r.score - 2.5, 0),
        genres: title.genres ?? [],
        tone: title.tone ?? [],
        themes: title.themes ?? [],
        moodTags: title.mood_tags ?? [],
        decade: null,
        originalLanguage: title.original_language,
        directorId: null,
        directorName: null,
        pacing: title.pacing,
        violenceLevel: title.violence_level,
        comedyLevel: title.comedy_level,
        emotionalIntensity: title.emotional_intensity,
        ratedAt: r.created_at,
      };
    })
    .filter((f: RatedTitleFeaturesWithTime | null): f is RatedTitleFeaturesWithTime => f !== null);
}

async function main() {
  const admin = createServiceClient(url, serviceKey);

  console.log("1. Finding real titles with distinct violence tags to build a controlled scenario...");
  // Taste evolution reads AI-tagged metadata columns directly, no embedding
  // dependency — unlike the recommendation engine, so no need to restrict
  // to title_embeddings here.
  const { data: calmTitles } = await admin.from("titles").select("id, name, violence_level").lte("violence_level", 1).limit(3);
  const { data: intenseTitles } = await admin.from("titles").select("id, name, violence_level").gte("violence_level", 4).limit(3);
  if (!calmTitles || calmTitles.length < 3 || !intenseTitles || intenseTitles.length < 3) {
    throw new Error("catalogue doesn't have enough low/high-violence titles to build this test scenario");
  }
  console.log(`   calm: ${calmTitles.map((t) => t.name).join(", ")}`);
  console.log(`   intense: ${intenseTitles.map((t) => t.name).join(", ")}`);

  console.log("2. Creating a test user, rating calm titles 'earlier' and intense titles 'recently'...");
  const user = await createTestUser(admin, "user");
  const earlierDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const recentDate = new Date().toISOString();

  for (const t of calmTitles) {
    await admin.from("ratings").insert({ user_id: user.id, title_id: t.id, score: 4.5, created_at: earlierDate });
  }
  for (const t of intenseTitles) {
    await admin.from("ratings").insert({ user_id: user.id, title_id: t.id, score: 4.5, created_at: recentDate });
  }

  console.log("3. Loading rated features through the real DB wiring and computing evolution...");
  const rated = await loadRatedFeatures(admin, user.id);
  if (rated.length !== 6) throw new Error(`expected 6 rated features loaded, got ${rated.length}`);

  const evolution = computeTasteEvolution(rated);
  if (!evolution) throw new Error("expected a non-null evolution result with 6 clearly-split ratings");
  if (!evolution.violenceShift) throw new Error("expected a detected violence tolerance shift");
  if (evolution.violenceShift.to <= evolution.violenceShift.from) {
    throw new Error(`expected violence tolerance to rise (calm -> intense), got ${JSON.stringify(evolution.violenceShift)}`);
  }
  if (!evolution.insights.some((i) => i.includes("violence tolerance"))) {
    throw new Error(`expected a violence-tolerance insight sentence, got: ${JSON.stringify(evolution.insights)}`);
  }
  console.log(`   ok — detected: "${evolution.insights.find((i) => i.includes("violence tolerance"))}"`);

  console.log("4. Confirming the same wiring runs cleanly against whichever real account has the most rating history...");
  const { data: allRatings } = await admin.from("ratings").select("user_id");
  const counts = new Map<string, number>();
  for (const r of allRatings ?? []) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
  const [realUserId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (realUserId) {
    const realRated = await loadRatedFeatures(admin, realUserId);
    const realEvolution = computeTasteEvolution(realRated); // may legitimately be null — just confirming no throw
    console.log(`   ok — ran against a real account (${realRated.length} ratings), evolution: ${realEvolution ? `${realEvolution.insights.length} insight(s)` : "null (not enough/too-even history)"}`);
  } else {
    console.log("   (no real rated accounts found — skipping, not a failure)");
  }

  console.log("5. Cleaning up...");
  await admin.from("ratings").delete().eq("user_id", user.id);
  await admin.auth.admin.deleteUser(user.id);

  console.log("\nAll taste evolution checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
