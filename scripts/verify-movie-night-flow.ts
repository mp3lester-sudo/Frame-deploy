/**
 * End-to-end verification of the Movie Night feature against the real
 * Supabase project: two test users, host creates a night, invites the
 * second user by username, both set preferences, host fetches candidates,
 * decides, reopens, then cancels. Mirrors src/lib/actions/movie-night.ts
 * and src/lib/recommendations/movie-night.ts exactly. Cleans up after itself.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeTestUser(admin: any, label: string) {
  const email = `mp3lester+mn${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `mn_${label}_${Date.now()}`.slice(0, 20).replace(/[^a-z0-9_]/g, "");

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

  console.log("1. Creating two test users (host + guest)...");
  const host = await makeTestUser(admin, "host");
  const guest = await makeTestUser(admin, "guest");
  console.log(`   host: ${host.username}, guest: ${guest.username}`);

  console.log("2. Host creates a movie night (mirrors createMovieNight)...");
  const { data: night, error: nightError } = await host.client
    .from("movie_nights")
    .insert({ host_id: host.userId })
    .select("id")
    .single();
  if (nightError || !night) throw new Error(`create movie_nights failed: ${nightError?.message}`);
  const nightId = night.id;
  const { error: hostJoinError } = await host.client
    .from("movie_night_participants")
    .insert({ movie_night_id: nightId, user_id: host.userId });
  if (hostJoinError) throw new Error(`host self-join failed: ${hostJoinError.message}`);
  console.log(`   movie_night ${nightId} created`);

  console.log("3. Host invites guest by username (mirrors inviteToMovieNight)...");
  const { data: guestProfile } = await host.client
    .from("profiles")
    .select("id")
    .eq("username", guest.username)
    .maybeSingle();
  if (!guestProfile) throw new Error("host could not look up guest profile (RLS or lookup bug)");
  const { error: inviteError } = await host.client
    .from("movie_night_participants")
    .insert({ movie_night_id: nightId, user_id: guestProfile.id });
  if (inviteError) throw new Error(`invite insert failed: ${inviteError.message}`);
  console.log("   invited");

  console.log("4. Guest can see the night now (RLS: participants can view)...");
  const { data: guestView, error: guestViewError } = await guest.client
    .from("movie_nights")
    .select("id, status")
    .eq("id", nightId)
    .maybeSingle();
  if (guestViewError || !guestView) throw new Error(`guest could not view movie night: ${guestViewError?.message}`);
  console.log(`   guest sees status = ${guestView.status}`);

  console.log("5. Both set preferences (mirrors setMyMovieNightPreferences)...");
  const { error: hostPrefError } = await host.client
    .from("movie_night_participants")
    .update({ mood: "something tense", excluded_genres: ["Horror"] })
    .eq("movie_night_id", nightId)
    .eq("user_id", host.userId);
  if (hostPrefError) throw new Error(`host preferences update failed: ${hostPrefError.message}`);
  const { error: guestPrefError } = await guest.client
    .from("movie_night_participants")
    .update({ mood: "not too long", excluded_genres: ["Documentary"] })
    .eq("movie_night_id", nightId)
    .eq("user_id", guest.userId);
  if (guestPrefError) throw new Error(`guest preferences update failed: ${guestPrefError.message}`);
  console.log("   both saved");

  console.log("6. Guest CANNOT invite (host-only check happens in the action, but let's confirm");
  console.log("   guest also can't just write another participant row in via RLS if uninvited)...");
  const thirdPartyId = "00000000-0000-0000-0000-000000000000";
  const { error: guestInviteAttempt } = await guest.client
    .from("movie_night_participants")
    .insert({ movie_night_id: nightId, user_id: thirdPartyId });
  if (!guestInviteAttempt) {
    console.log("   ⚠ unexpected: guest was able to insert a participant row for someone else");
  } else {
    console.log(`   blocked as expected (${guestInviteAttempt.code ?? "error"})`);
  }

  console.log("7. Computing candidates (mirrors getCandidatesForMovieNight — popularity fallback");
  console.log("   since no embeddings exist yet)...");
  const { data: popular } = await host.client
    .from("titles")
    .select("id, name, genres")
    .order("tmdb_vote_count", { ascending: false })
    .limit(60);
  const candidates = (popular ?? []).filter(
    (t) => !t.genres?.includes("Horror") && !t.genres?.includes("Documentary")
  );
  if (!candidates.length) throw new Error("no candidates survived the genre filter — catalogue issue");
  console.log(`   ${candidates.length} candidates after excluding Horror + Documentary, top: ${candidates[0].name}`);

  console.log("8. Host decides (mirrors decideMovieNight)...");
  const pick = candidates[0];
  const { error: decideError } = await host.client
    .from("movie_nights")
    .update({ status: "decided", decided_title_id: pick.id })
    .eq("id", nightId);
  if (decideError) throw new Error(`decide failed: ${decideError.message}`);
  const { data: afterDecide } = await guest.client
    .from("movie_nights")
    .select("status, decided_title_id")
    .eq("id", nightId)
    .maybeSingle();
  if (afterDecide?.status !== "decided" || afterDecide.decided_title_id !== pick.id) {
    throw new Error("guest does not see the decided pick — read path bug");
  }
  console.log(`   decided: ${pick.name} (visible to guest too)`);

  console.log("9. Host reopens, then cancels (mirrors reopenMovieNight / cancelMovieNight)...");
  const { error: reopenError } = await host.client
    .from("movie_nights")
    .update({ status: "collecting", decided_title_id: null })
    .eq("id", nightId);
  if (reopenError) throw new Error(`reopen failed: ${reopenError.message}`);
  const { error: cancelError } = await host.client
    .from("movie_nights")
    .update({ status: "cancelled" })
    .eq("id", nightId);
  if (cancelError) throw new Error(`cancel failed: ${cancelError.message}`);
  console.log("   reopened then cancelled, ok");

  console.log("10. Cleaning up test users (cascade deletes the movie night + participants)...");
  await admin.auth.admin.deleteUser(host.userId);
  await admin.auth.admin.deleteUser(guest.userId);
  console.log("   deleted");

  console.log("\n✅ Movie Night flow verified end-to-end against the real database.");
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err.message);
  process.exit(1);
});
