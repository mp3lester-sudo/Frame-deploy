/**
 * End-to-end verification of the redesigned home page's data logic against
 * the real Supabase project. src/app/page.tsx's queries can't be called
 * directly from a standalone script (they go through @/lib/supabase/server,
 * which needs a Next.js request/cookies context), so this mirrors each query
 * shape exactly — cold-start recommendations, the personalized branch, the
 * "active Movie Night" lookup, and the "circle activity from follows"
 * lookup — the same pattern used by verify-movie-night-flow.ts etc.
 * Cleans up after itself.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeTestUser(admin: any, label: string) {
  const email = `mp3lester+home${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `home_${label}_${Date.now()}`.slice(0, 20).replace(/[^a-z0-9_]/g, "");

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

  const { error: profileError } = await client
    .from("profiles")
    .insert({ id: created.user.id, username, display_name: username });
  if (profileError) throw new Error(`profile insert(${label}) failed: ${profileError.message}`);

  return { client, userId: created.user.id, username };
}

async function main() {
  const admin = createServiceClient(url, serviceKey);

  console.log("1. Creating two test users (main + a friend to follow)...");
  const main = await makeTestUser(admin, "main");
  const friend = await makeTestUser(admin, "friend");
  console.log(`   main: ${main.username}, friend: ${friend.username}`);

  console.log("2. Cold-start branch: no taste_vector yet for main user...");
  const { data: tasteVector } = await main.client
    .from("taste_vectors")
    .select("user_id")
    .eq("user_id", main.userId)
    .maybeSingle();
  if (tasteVector) throw new Error("expected no taste_vector for a brand-new user");

  const { data: coldStartTitles, error: coldStartError } = await main.client
    .from("titles")
    .select("*")
    .order("tmdb_vote_count", { ascending: false })
    .limit(5);
  if (coldStartError) throw new Error(`cold-start titles query failed: ${coldStartError.message}`);
  if (!coldStartTitles?.length) throw new Error("cold-start query returned nothing — unexpected given catalogue size");
  console.log(`   ok — cold-start fallback returns ${coldStartTitles.length} popular titles`);

  console.log("3. Personalized branch: rate titles, attempt to build a taste vector...");
  const { data: horror } = await main.client.from("titles").select("id").contains("genres", ["Horror"]).limit(5);
  if (!horror?.length) throw new Error("no Horror titles to rate — unexpected");
  for (const t of horror) {
    const { error: ratingError } = await main.client.from("ratings").upsert({ user_id: main.userId, title_id: t.id, score: 4.5 });
    if (ratingError) throw new Error(`rating upsert failed: ${ratingError.message}`);
    const { error: rpcError } = await main.client.rpc("upsert_taste_vector_from_rating", {
      p_user_id: main.userId,
      p_title_id: t.id,
      p_score: 4.5,
    });
    if (rpcError) throw new Error(`upsert_taste_vector_from_rating failed: ${rpcError.message}`);
  }

  const { data: vectorAfter } = await main.client
    .from("taste_vectors")
    .select("user_id")
    .eq("user_id", main.userId)
    .maybeSingle();
  const { count: embeddedCount } = await main.client
    .from("title_embeddings")
    .select("*", { count: "exact", head: true });
  if (!vectorAfter) {
    // upsert_taste_vector_from_rating no-ops (by design) when the rated
    // title has no row in title_embeddings — currently true catalogue-wide,
    // since the bulk TMDB ingestion ran with --no-ai and enrich:titles has
    // never been run against the full catalogue. Not a home-page bug, but
    // worth surfacing rather than silently treating cold-start as expected.
    console.warn(
      `   NOTE: no taste_vector was created (${embeddedCount ?? 0} titles have embeddings catalogue-wide). ` +
        `Every user is effectively stuck in cold-start mode until "npm run enrich:titles" backfills embeddings.`
    );
  } else {
    const [{ data: contentMatches }, { data: collabMatches }] = await Promise.all([
      main.client.rpc("match_titles_for_user", { p_user_id: main.userId, p_match_count: 20 }),
      main.client.rpc("similar_users_liked", { p_user_id: main.userId, p_match_count: 20 }),
    ]);
    console.log(`   ok — personalized branch has a taste_vector and ${contentMatches?.length ?? 0} content matches (${collabMatches?.length ?? 0} collaborative)`);
  }

  console.log("4. Movie Night: create a real active night, confirm the home-page lookup shape finds it...");
  const { data: night, error: nightError } = await main.client
    .from("movie_nights")
    .insert({ host_id: main.userId })
    .select("id, status")
    .single();
  if (nightError || !night) throw new Error(`create movie night failed: ${nightError?.message}`);
  await main.client.from("movie_night_participants").insert({ movie_night_id: night.id, user_id: main.userId });
  if (night.status !== "collecting") throw new Error(`expected default status "collecting", got "${night.status}"`);

  const { data: memberships } = await main.client
    .from("movie_night_participants")
    .select("movie_night_id")
    .eq("user_id", main.userId);
  const nightIds = (memberships ?? []).map((m) => m.movie_night_id);
  const { data: activeNights } = await main.client
    .from("movie_nights")
    .select("id, host_id")
    .in("id", nightIds)
    .eq("status", "collecting")
    .order("created_at", { ascending: false })
    .limit(1);
  if (activeNights?.[0]?.id !== night.id) throw new Error("home-page active-night lookup didn't find the night we just created");
  console.log("   ok — active Movie Night surfaces correctly");

  console.log("5. Circle activity: no follows yet -> must be empty, then follow the friend -> must show their activity...");
  const { data: followingBefore } = await main.client.from("follows").select("followee_id").eq("follower_id", main.userId);
  if ((followingBefore ?? []).length !== 0) throw new Error("expected zero follows for a brand-new user");
  console.log("   ok — zero follows means the circle section would be omitted entirely (no fake fallback)");

  // Friend rates something, generating a real activity_event (mirrors rateTitle's insert into activity_events).
  const { data: friendPick } = await friend.client.from("titles").select("id").limit(1).single();
  await friend.client.from("ratings").upsert({ user_id: friend.userId, title_id: friendPick!.id, score: 5 });
  const { error: activityError } = await friend.client
    .from("activity_events")
    .insert({ user_id: friend.userId, event_type: "rated", title_id: friendPick!.id });
  if (activityError) throw new Error(`activity_events insert failed: ${activityError.message}`);

  await main.client.from("follows").insert({ follower_id: main.userId, followee_id: friend.userId });
  const { data: followingAfter } = await main.client.from("follows").select("followee_id").eq("follower_id", main.userId);
  const followeeIds = (followingAfter ?? []).map((f) => f.followee_id);

  const { data: circleEvents, error: circleError } = await main.client
    .from("activity_events")
    .select("id, event_type, created_at, profiles(username, avatar_url), titles(name)")
    .in("user_id", followeeIds)
    .order("created_at", { ascending: false })
    .limit(3);
  if (circleError) throw new Error(`circle activity query failed: ${circleError.message}`);
  if (!circleEvents?.length) throw new Error("expected the friend's activity to show up after following them");
  const event = circleEvents[0] as unknown as { profiles: { username: string } | null };
  if (event.profiles?.username !== friend.username) throw new Error("circle activity event has the wrong profile joined");
  console.log("   ok — following someone surfaces their real activity, correctly joined to their profile");

  console.log("6. Cleaning up test users (cascades ratings, movie night, follows, activity)...");
  await admin.auth.admin.deleteUser(main.userId);
  await admin.auth.admin.deleteUser(friend.userId);

  console.log("\nAll home-page data checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
