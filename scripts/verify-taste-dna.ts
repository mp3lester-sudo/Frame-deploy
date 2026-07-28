/**
 * End-to-end verification of Taste DNA against the real Supabase project:
 * a test user rates a handful of real catalogue titles spanning different
 * genres, we replicate the exact query shape computeTasteDna() uses (ratings
 * -> titles -> title_credits/people), feed it through the real pure scorer,
 * and check the persisted taste_attributes row. Cleans up after itself.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { computeTasteDnaFromRatings, type RatedTitleFeatures } from "../src/lib/taste-dna/archetypes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function toDecade(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isFinite(year) ? `${Math.floor(year / 10) * 10}s` : null;
}

async function main() {
  const admin = createServiceClient(url, serviceKey);
  const email = `mp3lester+tastedna${Date.now()}@gmail.com`;
  const username = `dna_${Date.now()}`.slice(0, 20);
  const password = "TestPassword123!";

  console.log("1. Creating test user...");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createError || !created.user) throw new Error(`createUser failed: ${createError?.message}`);
  const userId = created.user.id;

  const client = createClient(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);

  const { error: profileError } = await client.from("profiles").insert({ id: userId, username, display_name: username });
  if (profileError) throw new Error(`profile insert failed: ${profileError.message}`);
  console.log(`   ${username} created`);

  console.log("2. Picking real titles to rate (Horror-heavy + a couple of Comedy)...");
  const [{ data: horror }, { data: comedy }] = await Promise.all([
    client.from("titles").select("id, name, genres").contains("genres", ["Horror"]).limit(4),
    client.from("titles").select("id, name, genres").contains("genres", ["Comedy"]).limit(2),
  ]);
  if (!horror?.length) throw new Error("No Horror titles in catalogue to rate — unexpected given ingestion size");
  console.log(`   rating ${horror.length} Horror titles highly, ${comedy?.length ?? 0} Comedy titles low`);

  console.log("3. Rating titles (mirrors rateTitle action's ratings write)...");
  for (const t of horror) {
    const { error } = await client.from("ratings").upsert({ user_id: userId, title_id: t.id, score: 4.5 });
    if (error) throw new Error(`rating upsert failed for ${t.name}: ${error.message}`);
  }
  for (const t of comedy ?? []) {
    const { error } = await client.from("ratings").upsert({ user_id: userId, title_id: t.id, score: 1 });
    if (error) throw new Error(`rating upsert failed for ${t.name}: ${error.message}`);
  }

  console.log("4. Replicating computeTasteDna()'s query shape...");
  const { data: ratings } = await client.from("ratings").select("title_id, score").eq("user_id", userId);
  if (!ratings?.length) throw new Error("no ratings came back for the test user");
  const titleIds = ratings.map((r) => r.title_id);

  const [{ data: titles }, { data: directorCredits }] = await Promise.all([
    client
      .from("titles")
      .select(
        "id, genres, tone, themes, mood_tags, pacing, violence_level, comedy_level, emotional_intensity, release_date, original_language"
      )
      .in("id", titleIds),
    client.from("title_credits").select("title_id, people(id, name)").eq("credit_type", "director").in("title_id", titleIds),
  ]);
  if (!titles?.length) throw new Error("titles query returned nothing for rated title_ids");

  const titleById = new Map(titles.map((t) => [t.id, t]));
  const directorByTitle = new Map<string, { id: string; name: string }>();
  for (const c of directorCredits ?? []) {
    const person = (c as unknown as { people: { id: string; name: string } | null }).people;
    if (person) directorByTitle.set(c.title_id, { id: person.id, name: person.name });
  }

  const rated: RatedTitleFeatures[] = ratings
    .map((r) => {
      const title = titleById.get(r.title_id);
      if (!title) return null;
      const director = directorByTitle.get(r.title_id);
      const feature: RatedTitleFeatures = {
        weight: Math.max(r.score - 2.5, 0),
        genres: title.genres ?? [],
        tone: title.tone ?? [],
        themes: title.themes ?? [],
        moodTags: title.mood_tags ?? [],
        decade: toDecade(title.release_date),
        originalLanguage: title.original_language,
        directorId: director?.id ?? null,
        directorName: director?.name ?? null,
        pacing: title.pacing,
        violenceLevel: title.violence_level,
        comedyLevel: title.comedy_level,
        emotionalIntensity: title.emotional_intensity,
      };
      return feature;
    })
    .filter((f): f is RatedTitleFeatures => f !== null);

  console.log("5. Scoring with the real computeTasteDnaFromRatings()...");
  const result = computeTasteDnaFromRatings(rated);
  const horrorArchetype = result.archetypes.find((a) => a.name === "Horror & Dread");
  if (!horrorArchetype || horrorArchetype.percent < 50) {
    throw new Error(`expected Horror & Dread to score high, got ${horrorArchetype?.percent}`);
  }
  const feelGood = result.archetypes.find((a) => a.name === "Feel-Good Comfort");
  if (feelGood && feelGood.percent > 0) {
    throw new Error(`expected Feel-Good Comfort to be 0 (disliked Comedy titles), got ${feelGood.percent}`);
  }
  console.log(`   Horror & Dread: ${horrorArchetype.percent}% (expected high)`);
  console.log(`   Feel-Good Comfort: ${feelGood?.percent ?? 0}% (expected 0, low-rated genre excluded)`);
  console.log(`   favoriteGenres: ${result.favoriteGenres.join(", ")}`);

  console.log("6. Persisting to taste_attributes (mirrors computeTasteDna's upsert, real RLS)...");
  const { error: upsertError } = await client.from("taste_attributes").upsert({
    user_id: userId,
    pacing_preference: result.pacingPreference,
    violence_tolerance: result.violenceTolerance,
    comedy_tolerance: result.comedyTolerance,
    emotional_intensity_preference: result.emotionalIntensityPreference,
    favorite_genres: result.favoriteGenres,
    favorite_decades: result.favoriteDecades,
    favorite_directors: result.favoriteDirectors.map((d) => d.id),
  });
  if (upsertError) throw new Error(`taste_attributes upsert failed: ${upsertError.message}`);

  const { data: persisted, error: readBackError } = await client
    .from("taste_attributes")
    .select("favorite_genres")
    .eq("user_id", userId)
    .maybeSingle();
  if (readBackError || !persisted) throw new Error(`read-back of taste_attributes failed: ${readBackError?.message}`);
  console.log(`   persisted favorite_genres: ${persisted.favorite_genres.join(", ")}`);

  console.log("7. Cleaning up test user (cascade deletes ratings + taste_attributes)...");
  await admin.auth.admin.deleteUser(userId);
  console.log("   deleted");

  console.log("\n✅ Taste DNA verified end-to-end against the real database.");
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err.message);
  process.exit(1);
});
