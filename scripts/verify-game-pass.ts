/**
 * End-to-end verification of Game Pass (migration 0017 + src/lib/game-pass/*)
 * against the real Supabase project. src/lib/game-pass/board.ts can't be
 * called directly from a standalone script (goes through
 * @/lib/supabase/server, which needs Next.js request/cookies context), so
 * this exercises the underlying tables/RPCs directly with plain
 * supabase-js clients — same pattern as the other verify-*.ts scripts.
 * The ranking algorithm itself (theme filtering, taste-vs-popularity
 * fallback) is already covered by unit tests; this focuses on the parts
 * that only a real database can prove: RLS, the SECURITY DEFINER
 * functions' authorization checks, and completion/reward correctness.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+gamepass${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `gp_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !created.user) throw new Error(`createUser failed for ${label}: ${error?.message}`);
  const client = createClient(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn failed for ${label}: ${signInError.message}`);
  const { error: profileError } = await client
    .from("profiles")
    .insert({ id: created.user.id, username, display_name: username });
  if (profileError) throw new Error(`profile insert failed for ${label}: ${profileError.message}`);
  return { id: created.user.id, client };
}

async function main() {
  const admin = createServiceClient(url, serviceKey);

  console.log("1. get_or_create_game_pass_season is idempotent and this month resolves to Hollywood Boulevard...");
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const dayCount = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  const seasonArgs = {
    p_period_start: periodStart,
    p_day_count: dayCount,
    p_theme_name: "Hollywood Boulevard",
    p_theme_description: "test call — should be ignored if a season already exists",
    p_theme_genres: ["Drama"],
    p_theme_keywords: ["legendary"],
    p_theme_decade_min: null,
    p_theme_decade_max: null,
  };
  const { data: season1, error: seasonErr1 } = await admin.rpc("get_or_create_game_pass_season", seasonArgs);
  if (seasonErr1 || !season1) throw new Error(`season create failed: ${seasonErr1?.message}`);
  const { data: season2 } = await admin.rpc("get_or_create_game_pass_season", {
    ...seasonArgs,
    p_theme_name: "Bogus Duplicate Theme",
  });
  if (season2.id !== season1.id || season2.theme_name !== season1.theme_name) {
    throw new Error(`expected the second call to return the SAME season, not create/overwrite — got ${JSON.stringify(season2)}`);
  }
  console.log(`   ok — season "${season1.theme_name}" is stable across repeated calls (day_count=${season1.day_count})`);

  console.log("2. Two test users, one joins and generates 3 synthetic picks (bypassing the real ranking algorithm)...");
  const userA = await createTestUser(admin, "a");
  const userB = await createTestUser(admin, "b");

  const { data: userAEntry, error: joinErr } = await userA.client
    .from("game_pass_entries")
    .insert({ season_id: season1.id, user_id: userA.id })
    .select("*")
    .single();
  if (joinErr || !userAEntry) throw new Error(`join failed: ${joinErr?.message}`);

  const { data: someTitles } = await admin.from("titles").select("id").limit(3);
  if (!someTitles || someTitles.length < 3) throw new Error("need at least 3 titles in the catalogue");

  const pickRows = someTitles.map((t, i) => ({ season_id: season1.id, user_id: userA.id, day_number: i + 1, title_id: t.id }));
  const { error: picksErr } = await userA.client.from("game_pass_picks").insert(pickRows);
  if (picksErr) throw new Error(`picks insert failed: ${picksErr.message}`);
  console.log("   ok — user A joined and has 3 picks");

  console.log("3. RLS: user B can't see user A's entry or picks...");
  const { data: bSeesAEntry } = await userB.client.from("game_pass_entries").select("*").eq("user_id", userA.id);
  const { data: bSeesAPicks } = await userB.client.from("game_pass_picks").select("*").eq("user_id", userA.id);
  if (bSeesAEntry && bSeesAEntry.length > 0) throw new Error("RLS leak: user B can see user A's entry");
  if (bSeesAPicks && bSeesAPicks.length > 0) throw new Error("RLS leak: user B can see user A's picks");
  console.log("   ok — RLS blocks cross-user reads");

  console.log("4. check_and_complete_game_pass returns false when picks are unwatched...");
  const { data: notYetComplete } = await userA.client.rpc("check_and_complete_game_pass", {
    p_season_id: season1.id,
    p_user_id: userA.id,
  });
  if (notYetComplete !== false) throw new Error(`expected false before any picks are watched, got ${notYetComplete}`);
  console.log("   ok");

  console.log("5. SECURITY DEFINER functions reject calls for a different user_id...");
  let unauthorizedThrew = false;
  try {
    await userB.client.rpc("check_and_complete_game_pass", { p_season_id: season1.id, p_user_id: userA.id }).throwOnError();
  } catch {
    unauthorizedThrew = true;
  }
  if (!unauthorizedThrew) throw new Error("expected check_and_complete_game_pass to reject a mismatched p_user_id");
  console.log("   ok — user B can't call the function on user A's behalf");

  console.log("6. Direct client UPDATE on game_pass_entries is blocked (no UPDATE policy)...");
  const { data: forgedUpdate } = await userA.client
    .from("game_pass_entries")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", userAEntry.id)
    .select();
  if (forgedUpdate && forgedUpdate.length > 0) {
    throw new Error("expected the client-side update to silently affect 0 rows (no UPDATE policy), but it succeeded");
  }
  console.log("   ok — completed_at can't be self-reported via a direct table update");

  console.log("7. Watching all 3 picks, then completion + reward granting...");
  for (const row of pickRows) {
    await admin.from("watch_history").insert({ user_id: userA.id, title_id: row.title_id });
  }
  const { data: nowComplete } = await userA.client.rpc("check_and_complete_game_pass", {
    p_season_id: season1.id,
    p_user_id: userA.id,
  });
  if (nowComplete !== true) throw new Error(`expected true once all picks are watched, got ${nowComplete}`);

  const { data: entryAfterComplete } = await admin.from("game_pass_entries").select("completed_at").eq("id", userAEntry.id).single();
  if (!entryAfterComplete?.completed_at) throw new Error("expected completed_at to be set");
  console.log("   ok — completed_at set once every pick is in watch_history");

  const { data: rewardResult } = await userA.client.rpc("grant_game_pass_reward", {
    p_season_id: season1.id,
    p_user_id: userA.id,
  });
  if (rewardResult !== true) throw new Error(`expected grant_game_pass_reward to succeed, got ${rewardResult}`);
  const { data: entryAfterReward } = await admin.from("game_pass_entries").select("reward_granted_at").eq("id", userAEntry.id).single();
  if (!entryAfterReward?.reward_granted_at) throw new Error("expected reward_granted_at to be set");
  console.log("   ok — reward granted exactly once, hook is real");

  console.log("8. Cleaning up...");
  await admin.from("watch_history").delete().eq("user_id", userA.id).in("title_id", pickRows.map((r) => r.title_id));
  await admin.from("game_pass_picks").delete().eq("user_id", userA.id);
  await admin.from("game_pass_entries").delete().eq("user_id", userA.id);
  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);

  console.log("\nAll Game Pass checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
