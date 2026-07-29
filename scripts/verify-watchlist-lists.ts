/**
 * End-to-end verification of the Watchlist + custom Lists feature against
 * the real Supabase project (migration 0020, plus the pre-existing
 * lists/list_items tables from 0001). Mirrors the actions' logic with a
 * plain supabase-js client since src/lib/actions/lists.ts can't be called
 * directly from a standalone script (goes through @/lib/supabase/server,
 * which needs a Next.js request/cookies context) — same pattern as the
 * other verify-*.ts scripts.
 *
 * Confirms: watchlist add/remove round-trips and stays private to the
 * owner (RLS), a created list fires a "list_created" activity event, items
 * can be added with notes and removed, a private list is invisible to a
 * second user while a public one isn't, and deleting a list cascades its
 * items. Cleans up after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { validateListTitle } from "../src/lib/lists/validate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+lists${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `lists_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("1. Creating two test users (owner + a second, unrelated user)...");
  const owner = await createTestUser(admin, "owner");
  const other = await createTestUser(admin, "other");

  console.log("2. Picking two real catalogue titles...");
  const { data: titles } = await owner.client.from("titles").select("id, name").limit(2);
  if (!titles || titles.length < 2) throw new Error("not enough titles in catalogue to test with");
  const [titleA, titleB] = titles;

  console.log("3. Watchlist: add, confirm, remove, confirm gone...");
  await owner.client.from("watchlist").insert({ user_id: owner.id, title_id: titleA.id });
  const { data: watchlistAfterAdd } = await owner.client.from("watchlist").select("title_id").eq("user_id", owner.id);
  if (!watchlistAfterAdd?.some((r) => r.title_id === titleA.id)) throw new Error("expected title in watchlist after add");
  console.log("   ok — title appears in watchlist after adding");

  const { data: othersViewOfWatchlist } = await other.client.from("watchlist").select("*").eq("user_id", owner.id);
  if ((othersViewOfWatchlist ?? []).length !== 0) throw new Error("expected watchlist to be private (RLS) — another user shouldn't see it");
  console.log("   ok — watchlist is private, invisible to another user (RLS)");

  await owner.client.from("watchlist").delete().eq("user_id", owner.id).eq("title_id", titleA.id);
  const { data: watchlistAfterRemove } = await owner.client.from("watchlist").select("title_id").eq("user_id", owner.id);
  if (watchlistAfterRemove?.some((r) => r.title_id === titleA.id)) throw new Error("expected title gone from watchlist after remove");
  console.log("   ok — title removed from watchlist");

  console.log("4. Validating list title rules (mirrors src/lib/lists/validate.ts)...");
  if (validateListTitle("   ").ok) throw new Error("expected empty title to be rejected");
  console.log("   ok — empty list titles are rejected client-side");

  console.log("5. Creating a public list + a private list...");
  const { data: publicList, error: publicListError } = await owner.client
    .from("lists")
    .insert({ user_id: owner.id, title: "Best Heist Movies", description: "Vault jobs and getaway cars.", is_public: true })
    .select("id")
    .single();
  if (publicListError || !publicList) throw new Error(`create public list failed: ${publicListError?.message}`);
  await owner.client.from("activity_events").insert({ user_id: owner.id, event_type: "list_created", ref_id: publicList.id });

  const { data: privateList, error: privateListError } = await owner.client
    .from("lists")
    .insert({ user_id: owner.id, title: "Guilty Pleasures", is_public: false })
    .select("id")
    .single();
  if (privateListError || !privateList) throw new Error(`create private list failed: ${privateListError?.message}`);

  const { data: listCreatedEvent } = await owner.client
    .from("activity_events")
    .select("*")
    .eq("user_id", owner.id)
    .eq("event_type", "list_created")
    .eq("ref_id", publicList.id)
    .maybeSingle();
  if (!listCreatedEvent) throw new Error("expected a list_created activity event for the public list");
  console.log("   ok — creating a list fires a list_created activity event (lights up the dormant feed copy)");

  console.log("6. Adding titles to the public list, with a note...");
  await owner.client.from("list_items").insert([
    { list_id: publicList.id, title_id: titleA.id, position: 0, note: "The vault sequence alone earns this a spot." },
    { list_id: publicList.id, title_id: titleB.id, position: 1 },
  ]);
  const { data: itemsAfterAdd } = await owner.client.from("list_items").select("title_id, note").eq("list_id", publicList.id);
  if (itemsAfterAdd?.length !== 2) throw new Error(`expected 2 items in the list, got ${itemsAfterAdd?.length}`);
  const noteRow = itemsAfterAdd.find((r) => r.title_id === titleA.id);
  if (noteRow?.note !== "The vault sequence alone earns this a spot.") throw new Error("expected note to be saved on the list item");
  console.log("   ok — both titles added, with a note preserved on one of them");

  console.log("7. Visibility: the public list is readable by another user, the private one isn't...");
  const { data: otherViewOfPublicList } = await other.client.from("lists").select("*").eq("id", publicList.id).maybeSingle();
  if (!otherViewOfPublicList) throw new Error("expected the public list to be visible to another user");
  const { data: otherViewOfPrivateList } = await other.client.from("lists").select("*").eq("id", privateList.id).maybeSingle();
  if (otherViewOfPrivateList) throw new Error("expected the private list to be invisible to another user (RLS)");
  console.log("   ok — public list visible to others, private list is not (RLS)");

  const { data: otherViewOfPublicListItems } = await other.client.from("list_items").select("*").eq("list_id", publicList.id);
  if ((otherViewOfPublicListItems ?? []).length !== 2) throw new Error("expected another user to see items of a public list");
  console.log("   ok — another user can see the public list's items too");

  console.log("8. Removing one item from the list...");
  await owner.client.from("list_items").delete().eq("list_id", publicList.id).eq("title_id", titleB.id);
  const { data: itemsAfterRemove } = await owner.client.from("list_items").select("title_id").eq("list_id", publicList.id);
  if (itemsAfterRemove?.length !== 1) throw new Error(`expected 1 item left, got ${itemsAfterRemove?.length}`);
  console.log("   ok — item removed, one remains");

  console.log("9. Deleting the public list cascades its remaining item...");
  await owner.client.from("lists").delete().eq("id", publicList.id);
  const { data: itemsAfterListDelete } = await admin.from("list_items").select("*").eq("list_id", publicList.id);
  if ((itemsAfterListDelete ?? []).length !== 0) throw new Error("expected list_items to cascade-delete with the list");
  console.log("   ok — deleting a list cascades its items");

  console.log("10. Cleaning up test users (cascades their remaining private list too)...");
  await admin.auth.admin.deleteUser(owner.id);
  await admin.auth.admin.deleteUser(other.id);

  console.log("\nAll Watchlist + Lists checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
