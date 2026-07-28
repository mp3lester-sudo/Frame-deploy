/**
 * End-to-end verification of movie clubs against the real Supabase project
 * (migration 0013). src/lib/actions/clubs.ts can't be called directly from
 * a standalone script (goes through @/lib/supabase/server, which needs a
 * Next.js request/cookies context), so this mirrors its logic with a plain
 * supabase-js client — same pattern as the other verify-*.ts scripts.
 *
 * Creates an owner who starts a club (and is auto-added as a member), a
 * second user who joins and posts, and a third user who never joins.
 * Confirms: the club and its roster are publicly visible even to the
 * non-member, the non-member gets zero posts back (RLS-gated) rather than
 * an error, the non-member can't insert a post (RLS), the member can post
 * and then leave, and a departed member's posts remain (leaving doesn't
 * retroactively hide history). Cleans up after itself.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { validateClubName, validateClubPostBody } from "../src/lib/clubs/validate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTestUser(admin: SupabaseClient<any>, label: string) {
  const email = `mp3lester+clubs${label}${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `club_${label}_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("1. Validating pure helpers reject bad input...");
  if (validateClubName("").ok) throw new Error("expected empty club name to be rejected");
  if (validateClubPostBody("").ok) throw new Error("expected empty post to be rejected");
  console.log("   ok");

  console.log("2. Creating owner, member, and outsider test users...");
  const owner = await createTestUser(admin, "owner");
  const member = await createTestUser(admin, "member");
  const outsider = await createTestUser(admin, "outsider");

  console.log("3. Owner creates a club (and is auto-added as owner-role member)...");
  const nameResult = validateClubName("Verification Test Club");
  if (!nameResult.ok) throw new Error("unexpected validation failure");
  const { data: club, error: clubError } = await owner.client
    .from("clubs")
    .insert({ name: nameResult.value, description: "", created_by: owner.id })
    .select("id")
    .single();
  if (clubError || !club) throw new Error(`club insert failed: ${clubError?.message}`);
  await owner.client.from("club_members").insert({ club_id: club.id, user_id: owner.id, role: "owner" });

  console.log("4. Outsider (never joined) can still see the club and its roster...");
  const { data: clubAsOutsider } = await outsider.client.from("clubs").select("id, name").eq("id", club.id).maybeSingle();
  if (!clubAsOutsider) throw new Error("expected the club to be publicly visible");
  const { data: rosterAsOutsider } = await outsider.client.from("club_members").select("user_id").eq("club_id", club.id);
  if (!rosterAsOutsider?.some((r) => r.user_id === owner.id)) throw new Error("expected the roster to be publicly visible");
  console.log("   ok — club + roster are public");

  console.log("5. Member joins the club...");
  await member.client.from("club_members").upsert({ club_id: club.id, user_id: member.id, role: "member" });
  const { count: memberCount } = await outsider.client
    .from("club_members")
    .select("*", { count: "exact", head: true })
    .eq("club_id", club.id);
  if (memberCount !== 2) throw new Error(`expected 2 members (owner + member), got ${memberCount}`);
  console.log("   ok — member count is 2");

  console.log("6. Outsider gets zero posts (RLS-gated, not an error) since they haven't joined...");
  const { data: postsAsOutsider, error: postsAsOutsiderError } = await outsider.client
    .from("club_posts")
    .select("id")
    .eq("club_id", club.id);
  if (postsAsOutsiderError) throw new Error(`expected no error, just an empty result: ${postsAsOutsiderError.message}`);
  if ((postsAsOutsider ?? []).length !== 0) throw new Error("expected zero posts visible to a non-member");
  console.log("   ok — non-member sees zero posts, no error");

  console.log("7. Outsider cannot post (RLS)...");
  const bodyResult = validateClubPostBody("sneaking in");
  if (!bodyResult.ok) throw new Error("unexpected validation failure");
  const { error: outsiderPostError } = await outsider.client
    .from("club_posts")
    .insert({ club_id: club.id, user_id: outsider.id, body: bodyResult.value });
  if (!outsiderPostError) throw new Error("expected RLS to block a non-member from posting");
  console.log("   ok — RLS blocks a non-member from posting");

  console.log("8. Member posts successfully...");
  const memberBody = validateClubPostBody("Excited to be here!");
  if (!memberBody.ok) throw new Error("unexpected validation failure");
  const { data: post, error: postError } = await member.client
    .from("club_posts")
    .insert({ club_id: club.id, user_id: member.id, body: memberBody.value })
    .select("id")
    .single();
  if (postError || !post) throw new Error(`expected member's post to succeed: ${postError?.message}`);

  const { data: postsAsOwner } = await owner.client.from("club_posts").select("id").eq("club_id", club.id);
  if (!postsAsOwner?.some((p) => p.id === post.id)) throw new Error("expected the owner (a fellow member) to see the post");
  console.log("   ok — member's post succeeded and is visible to the owner");

  console.log("9. Member leaves the club — their post stays (history isn't retroactively hidden)...");
  await member.client.from("club_members").delete().eq("club_id", club.id).eq("user_id", member.id);
  const { count: memberCountAfterLeave } = await outsider.client
    .from("club_members")
    .select("*", { count: "exact", head: true })
    .eq("club_id", club.id);
  if (memberCountAfterLeave !== 1) throw new Error(`expected 1 member after leaving, got ${memberCountAfterLeave}`);
  const { data: postsAfterLeave } = await owner.client.from("club_posts").select("id").eq("club_id", club.id);
  if (!postsAfterLeave?.some((p) => p.id === post.id)) throw new Error("expected the departed member's post to remain");
  console.log("   ok — left the club, post history intact");

  console.log("10. Cleaning up...");
  await admin.from("clubs").delete().eq("id", club.id); // cascades to club_members + club_posts
  await admin.auth.admin.deleteUser(owner.id);
  await admin.auth.admin.deleteUser(member.id);
  await admin.auth.admin.deleteUser(outsider.id);

  console.log("\nAll movie club checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
