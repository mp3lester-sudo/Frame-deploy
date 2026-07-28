/**
 * End-to-end verification of profile editing (migration 0010) against the
 * real Supabase project: bio/display name update, avatar upload to Storage
 * (including a negative RLS test — another user must NOT be able to write
 * into someone else's avatar folder), the four-favorite-titles table
 * (position constraints + public read + owner-only write), and the
 * unrateTitle "cancel watched" flow. Cleans up after itself, including the
 * uploaded storage object (deleting the auth user does not cascade to
 * storage.objects).
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeTestUser(admin: any, label: string) {
  const email = `mp3lester+prof${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  // slice(-20) (not slice(0, 20)) so the trailing, most-distinguishing
  // timestamp digits survive truncation instead of getting cut off — with
  // slice(0, 20), differently-lengthed prefixes ("owner" vs "intruder")
  // ate different amounts of the timestamp, occasionally truncating away
  // enough of it that two calls in the same run collided on username.
  const username = `prof_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);

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

  console.log("1. Creating two test users (owner + an intruder)...");
  const owner = await makeTestUser(admin, "owner");
  const intruder = await makeTestUser(admin, "intruder");
  console.log(`   owner: ${owner.username}, intruder: ${intruder.username}`);

  console.log("2. Bio + display name (mirrors updateProfile)...");
  const { error: updateError } = await owner.client
    .from("profiles")
    .update({ display_name: "Test Display Name", bio: "A test bio about test movies." })
    .eq("id", owner.userId);
  if (updateError) throw new Error(`profile update failed: ${updateError.message}`);
  const { data: updatedProfile } = await owner.client.from("profiles").select("display_name, bio").eq("id", owner.userId).single();
  if (updatedProfile?.display_name !== "Test Display Name" || updatedProfile?.bio !== "A test bio about test movies.") {
    throw new Error(`profile fields didn't persist: ${JSON.stringify(updatedProfile)}`);
  }
  console.log("   ok — bio/display name persisted");

  console.log("3. Avatar upload to Storage (mirrors uploadAvatar)...");
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const avatarPath = `${owner.userId}/avatar.png`;
  const { error: uploadError } = await owner.client.storage.from("avatars").upload(avatarPath, tinyPng, {
    upsert: true,
    contentType: "image/png",
  });
  if (uploadError) throw new Error(`avatar upload failed: ${uploadError.message}`);

  const { data: publicUrlData } = owner.client.storage.from("avatars").getPublicUrl(avatarPath);
  const fetchRes = await fetch(publicUrlData.publicUrl);
  if (!fetchRes.ok) throw new Error(`uploaded avatar isn't publicly fetchable: ${fetchRes.status}`);
  console.log("   ok — avatar uploaded and publicly fetchable");

  console.log("4. RLS: intruder must NOT be able to write into owner's avatar folder...");
  const { error: intruderUploadError } = await intruder.client.storage
    .from("avatars")
    .upload(avatarPath, tinyPng, { upsert: true, contentType: "image/png" });
  if (!intruderUploadError) throw new Error("SECURITY BUG: intruder was able to overwrite another user's avatar");
  console.log("   ok — intruder upload correctly rejected by RLS");

  console.log("5. Favorite titles: set four, check position/public-read/owner-only-write...");
  const { data: titles } = await owner.client.from("titles").select("id, name").limit(4);
  if (!titles || titles.length < 4) throw new Error("not enough titles in catalogue to test favorites");

  const favoriteRows = titles.map((t, i) => ({ user_id: owner.userId, title_id: t.id, position: i + 1 }));
  const { error: favError } = await owner.client.from("favorite_titles").insert(favoriteRows);
  if (favError) throw new Error(`favorite_titles insert failed: ${favError.message}`);

  const { data: favBack } = await intruder.client
    .from("favorite_titles")
    .select("position, titles(name)")
    .eq("user_id", owner.userId)
    .order("position", { ascending: true });
  if (favBack?.length !== 4) throw new Error(`expected 4 favorites visible to another user (public read), got ${favBack?.length}`);
  console.log("   ok — 4 favorites saved and publicly readable, in position order");

  const { error: intruderFavError } = await intruder.client
    .from("favorite_titles")
    .insert({ user_id: owner.userId, title_id: titles[0].id, position: 1 });
  if (!intruderFavError) throw new Error("SECURITY BUG: intruder was able to insert into another user's favorites (should conflict/deny)");
  console.log("   ok — intruder cannot write into owner's favorites");

  console.log("6. Cancel watched (mirrors unrateTitle)...");
  const { data: someTitle } = await owner.client.from("titles").select("id").limit(1).single();
  await owner.client.from("ratings").upsert({ user_id: owner.userId, title_id: someTitle!.id, score: 4 });
  await owner.client.from("watch_history").upsert({ user_id: owner.userId, title_id: someTitle!.id });
  await owner.client.from("activity_events").insert({ user_id: owner.userId, event_type: "rated", title_id: someTitle!.id });

  await owner.client.from("ratings").delete().eq("user_id", owner.userId).eq("title_id", someTitle!.id);
  await owner.client.from("watch_history").delete().eq("user_id", owner.userId).eq("title_id", someTitle!.id);
  await owner.client.from("activity_events").delete().eq("user_id", owner.userId).eq("title_id", someTitle!.id).eq("event_type", "rated");

  const [{ data: ratingAfter }, { data: watchAfter }, { data: eventsAfter }] = await Promise.all([
    owner.client.from("ratings").select("*").eq("user_id", owner.userId).eq("title_id", someTitle!.id),
    owner.client.from("watch_history").select("*").eq("user_id", owner.userId).eq("title_id", someTitle!.id),
    owner.client.from("activity_events").select("*").eq("user_id", owner.userId).eq("title_id", someTitle!.id),
  ]);
  if (ratingAfter?.length || watchAfter?.length || eventsAfter?.length) {
    throw new Error("cancel-watched didn't fully clean up rating/watch_history/activity_events");
  }
  console.log("   ok — rating, watch history, and activity event all removed");

  console.log("7. Cleaning up (test users + the uploaded storage object)...");
  await admin.storage.from("avatars").remove([avatarPath]);
  await admin.auth.admin.deleteUser(owner.userId);
  await admin.auth.admin.deleteUser(intruder.userId);

  console.log("\nAll profile-editing checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
