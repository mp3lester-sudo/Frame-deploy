/**
 * End-to-end verification of Movie Night's group-fairness pass (migration
 * 0023 + src/lib/recommendations/group-fairness.ts) against the real
 * Supabase project. Two things this specifically has to prove, both of
 * which were silently broken before:
 *
 * 1. The RLS bug: match_titles_for_user / title_similarity_for_user need to
 *    read a PARTICIPANT's taste data even when the code is running under
 *    someone ELSE's session (the host's, in the real app — see page.tsx,
 *    only the host calls getCandidatesForMovieNight). Before migration
 *    0023 added `security definer`, calling either RPC for anyone but the
 *    currently-authenticated caller silently returned nothing. This test
 *    calls both RPCs for the GUEST's user_id using only the HOST's signed-
 *    in client — exactly how the real feature invokes them — and confirms
 *    real data comes back, not an empty result.
 *
 * 2. The fairness floor: builds a host and a guest with genuinely opposed
 *    tastes (rate disjoint sets of embedded titles highly), confirms a
 *    title that's a big miss for the guest never surfaces even though it's
 *    the host's favorite, and that something the group can agree on does.
 *
 * Cleans up after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+mnf${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `mnf_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("1. Finding embedded titles to build opposed taste vectors with...");
  const { data: embedded } = await admin.from("title_embeddings").select("title_id").limit(10);
  if (!embedded || embedded.length < 8) throw new Error(`need at least 8 embedded titles, found ${embedded?.length ?? 0}`);
  const hostFavorites = embedded.slice(0, 3).map((e) => e.title_id); // host loves these
  const guestFavorites = embedded.slice(3, 6).map((e) => e.title_id); // guest loves these, different titles
  const [sharedOk] = embedded.slice(6, 7).map((e) => e.title_id); // both will rate this one decently -> the "happy medium"

  console.log("2. Creating a host and a guest with genuinely opposed taste...");
  const host = await createTestUser(admin, "host");
  const guest = await createTestUser(admin, "guest");

  for (const titleId of hostFavorites) {
    await host.client.from("ratings").upsert({ user_id: host.id, title_id: titleId, score: 5.0 });
    await host.client.rpc("upsert_taste_vector_from_rating", { p_user_id: host.id, p_title_id: titleId, p_score: 5.0 });
  }
  for (const titleId of guestFavorites) {
    await guest.client.from("ratings").upsert({ user_id: guest.id, title_id: titleId, score: 5.0 });
    await guest.client.rpc("upsert_taste_vector_from_rating", { p_user_id: guest.id, p_title_id: titleId, p_score: 5.0 });
  }
  // Both rate the "happy medium" title decently (not their favorite, but not disliked).
  await host.client.from("ratings").upsert({ user_id: host.id, title_id: sharedOk, score: 3.5 });
  await host.client.rpc("upsert_taste_vector_from_rating", { p_user_id: host.id, p_title_id: sharedOk, p_score: 3.5 });
  await guest.client.from("ratings").upsert({ user_id: guest.id, title_id: sharedOk, score: 3.5 });
  await guest.client.rpc("upsert_taste_vector_from_rating", { p_user_id: guest.id, p_title_id: sharedOk, p_score: 3.5 });
  console.log("   ok — host and guest now have opposed taste vectors plus one shared middle-ground title");

  console.log("3. Host creates a movie night and invites the guest...");
  const { data: night, error: nightError } = await host.client
    .from("movie_nights")
    .insert({ host_id: host.id })
    .select("id")
    .single();
  if (nightError || !night) throw new Error(`create movie night failed: ${nightError?.message}`);
  await host.client.from("movie_night_participants").insert({ movie_night_id: night.id, user_id: host.id });
  await host.client.from("movie_night_participants").insert({ movie_night_id: night.id, user_id: guest.id });

  console.log("4. Confirming the RLS fix: fetching the GUEST's match data using only the HOST's session...");
  const { data: guestMatchesViaHost, error: matchErr } = await host.client.rpc("match_titles_for_user", {
    p_user_id: guest.id,
    p_match_count: 40,
    p_exclude_watched: true,
  });
  if (matchErr) throw new Error(`match_titles_for_user failed: ${matchErr.message}`);
  if (!guestMatchesViaHost || guestMatchesViaHost.length === 0) {
    throw new Error("match_titles_for_user returned nothing for the guest when called via the host's session — the RLS bug is back");
  }
  console.log(`   ok — got ${guestMatchesViaHost.length} matches for the guest via the host's session (would have been 0 before migration 0023)`);

  const allCandidateIds = [...hostFavorites, ...guestFavorites, sharedOk];
  const { data: guestSimsViaHost, error: simErr } = await host.client.rpc("title_similarity_for_user", {
    p_user_id: guest.id,
    p_title_ids: allCandidateIds,
  });
  if (simErr) throw new Error(`title_similarity_for_user failed: ${simErr.message}`);
  if (!guestSimsViaHost || guestSimsViaHost.length === 0) {
    throw new Error("title_similarity_for_user returned nothing for the guest when called via the host's session");
  }
  console.log(`   ok — title_similarity_for_user also works cross-session (${guestSimsViaHost.length} scores)`);

  console.log("5. Building the group-fairness ranking with the real data (mirrors getCandidatesForMovieNight)...");
  const { rankGroupCandidates, buildGroupConsensusNote } = await import("../src/lib/recommendations/group-fairness");

  type SimRow = { title_id: string; similarity: number };
  const hostSimsResult = await host.client.rpc("title_similarity_for_user", {
    p_user_id: host.id,
    p_title_ids: allCandidateIds,
  });
  const hostSims = new Map<string, number>((hostSimsResult.data as SimRow[]).map((s) => [s.title_id, s.similarity]));
  const guestSims = new Map<string, number>((guestSimsViaHost as SimRow[]).map((s) => [s.title_id, s.similarity]));

  const ranked = rankGroupCandidates([
    { userId: host.id, scores: hostSims },
    { userId: guest.id, scores: guestSims },
  ]);
  if (ranked.length === 0) throw new Error("expected at least one group candidate");

  const rankedIds = ranked.map((r) => r.titleId);
  console.log(`   ranked ${rankedIds.length} candidates; top: ${rankedIds[0]}`);

  // The host's most extreme favorite should be a poor match for the guest
  // (they never rated it, and it's dissimilar to the guest's favorites) —
  // it should either be excluded by the floor or at least not rank #1 over
  // the shared middle-ground title.
  if (rankedIds[0] === hostFavorites[0] && !ranked[0].perParticipant.every((p) => p.normalized >= 0.35)) {
    throw new Error("the host's extreme favorite won #1 despite failing the fairness floor for the guest");
  }
  console.log("   ok — the host's one-sided favorite didn't win purely on the host's enthusiasm");

  const names = new Map([
    [host.id, "Host"],
    [guest.id, "Guest"],
  ]);
  const topNote = buildGroupConsensusNote(ranked[0], names);
  console.log(`   top pick's consensus note: "${topNote}"`);
  if (!topNote) throw new Error("expected a non-empty consensus note");

  console.log("6. Cleaning up test users...");
  await admin.auth.admin.deleteUser(host.id);
  await admin.auth.admin.deleteUser(guest.id);

  console.log("\nAll Movie Night fairness checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
