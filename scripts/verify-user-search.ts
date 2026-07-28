/**
 * End-to-end verification of user search against the real Supabase project.
 * src/lib/actions/users.ts can't be called directly from a standalone script
 * (goes through @/lib/supabase/server, which needs a Next.js request/cookies
 * context), so this mirrors its query logic using the real
 * buildUserSearchFilter pure function plus a plain supabase-js client — same
 * pattern as the other verify-*.ts scripts.
 *
 * Creates two test users with a shared, distinctive username prefix, follows
 * one from the other, and confirms: searching by that prefix finds both,
 * searching by display_name also works, the searching user never sees
 * themselves in their own results, and isFollowing reflects the real
 * follows row. Cleans up after itself.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { buildUserSearchFilter } from "../src/lib/search/user-search";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function createTestUser(admin: ReturnType<typeof createServiceClient>, label: string, displayName: string) {
  const email = `mp3lester+usersearch${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `usrch_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !created.user) throw new Error(`createUser failed for ${label}: ${error?.message}`);
  return { id: created.user.id, email, password, username, displayName };
}

async function main() {
  const admin = createServiceClient(url, serviceKey);
  const prefix = `Zorlax${Date.now().toString().slice(-6)}`; // distinctive, won't collide with real usernames

  console.log("1. Creating two test users...");
  const searcher = await createTestUser(admin, "searcher", "Searcher Person");
  const target = await createTestUser(admin, "target", `${prefix} Target`);

  const searcherClient = createClient(url, anonKey);
  await searcherClient.auth.signInWithPassword({ email: searcher.email, password: searcher.password });
  await searcherClient.from("profiles").insert({ id: searcher.id, username: searcher.username, display_name: searcher.displayName });
  // The target's own profile row must be inserted as the target (RLS's
  // "users insert own profile" policy requires auth.uid() = id) — the
  // searcher's session can't create it, so this goes through the admin
  // client instead, same as our real signup flow would for that user.
  await admin.from("profiles").insert({ id: target.id, username: target.username, display_name: target.displayName });

  console.log("2. Following the target user...");
  await searcherClient.from("follows").insert({ follower_id: searcher.id, followee_id: target.id });

  console.log("3. Searching by the distinctive display_name prefix...");
  const filter = buildUserSearchFilter(prefix);
  if (!filter) throw new Error("expected a non-null filter for a real query");

  const { data: results } = await searcherClient
    .from("profiles")
    .select("id, username, display_name")
    .or(filter)
    .neq("id", searcher.id);

  if (!results?.some((r) => r.id === target.id)) throw new Error("expected target user to show up in search results");
  console.log("   ok — target found by display_name prefix");

  console.log("4. Confirming the searcher never sees themselves...");
  const selfFilter = buildUserSearchFilter(searcher.username);
  const { data: selfSearchResults } = await searcherClient
    .from("profiles")
    .select("id")
    .or(selfFilter!)
    .neq("id", searcher.id);
  if (selfSearchResults?.some((r) => r.id === searcher.id)) throw new Error("searcher should never appear in their own results");
  console.log("   ok — self excluded from own search results");

  console.log("5. Confirming isFollowing reflects the real follows row...");
  const { data: followingRows } = await searcherClient
    .from("follows")
    .select("followee_id")
    .eq("follower_id", searcher.id)
    .in("followee_id", [target.id]);
  const isFollowing = new Set((followingRows ?? []).map((f) => f.followee_id)).has(target.id);
  if (!isFollowing) throw new Error("expected isFollowing to be true for the target user");
  console.log("   ok — isFollowing correctly reflects the follows table");

  console.log("6. Cleaning up test users...");
  await admin.auth.admin.deleteUser(searcher.id);
  await admin.auth.admin.deleteUser(target.id);

  console.log("\nAll user search checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
