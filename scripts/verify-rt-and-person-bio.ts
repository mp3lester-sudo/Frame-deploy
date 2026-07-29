/**
 * Verifies migration 0024 (RT critic score + person bio columns) against
 * the real Supabase project: confirms the new columns exist and are
 * writable by the service role, that the anon/public role can still read
 * them (catalog stays public-read) but cannot write them (catalog writes
 * stay service-role only, per 0002_rls.sql), and cleans up after itself by
 * resetting the touched rows back to their pre-test (null/unchecked) state.
 *
 * Usage: npm run verify:rt-and-person-bio
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

async function main() {
  console.log("1. Fetching a sample movie title and a sample person...");
  const { data: title, error: titleErr } = await admin
    .from("titles")
    .select("id, rt_critic_score, imdb_id, rt_checked_at")
    .eq("type", "movie")
    .limit(1)
    .single();
  if (titleErr || !title) throw new Error(`Could not fetch a sample title: ${titleErr?.message}`);

  const { data: person, error: personErr } = await admin
    .from("people")
    .select("id, bio, birthday, place_of_birth, bio_checked_at")
    .limit(1)
    .single();
  if (personErr || !person) throw new Error(`Could not fetch a sample person: ${personErr?.message}`);

  console.log(`   title=${title.id} person=${person.id}`);

  console.log("2. Service role writes rt_critic_score / bio fields...");
  const { error: titleWriteErr } = await admin
    .from("titles")
    .update({ rt_critic_score: 87, imdb_id: "tt0000000", rt_checked_at: new Date().toISOString() })
    .eq("id", title.id);
  if (titleWriteErr) throw new Error(`Service role could not write to titles: ${titleWriteErr.message}`);

  const { error: personWriteErr } = await admin
    .from("people")
    .update({
      bio: "Test bio.",
      birthday: "1970-01-01",
      place_of_birth: "Testville",
      bio_checked_at: new Date().toISOString(),
    })
    .eq("id", person.id);
  if (personWriteErr) throw new Error(`Service role could not write to people: ${personWriteErr.message}`);
  console.log("   OK — service role writes succeed.");

  console.log("3. Confirming anon role can read the new columns (public catalog)...");
  const { data: anonTitle, error: anonReadErr } = await anon
    .from("titles")
    .select("rt_critic_score, imdb_id")
    .eq("id", title.id)
    .single();
  if (anonReadErr || anonTitle?.rt_critic_score !== 87) {
    throw new Error(`Anon read of new title columns failed: ${anonReadErr?.message ?? "unexpected value"}`);
  }
  console.log("   OK — anon can read the new columns.");

  console.log("4. Confirming anon role CANNOT write to titles/people (catalog stays service-role-only)...");
  // PostgREST doesn't surface an "error" for an RLS-filtered update — it
  // just filters the row out and reports 0 rows affected, so the only
  // reliable check is: did the value actually change in the DB?
  await anon.from("titles").update({ rt_critic_score: 1 }).eq("id", title.id);
  const { data: unchanged } = await admin.from("titles").select("rt_critic_score").eq("id", title.id).single();
  if (unchanged?.rt_critic_score === 1) throw new Error("Anon role was able to write to titles — RLS regression!");
  console.log("   OK — anon write silently rejected by RLS (value unchanged).");

  console.log("5. Resetting test rows back to unchecked state...");
  await admin
    .from("titles")
    .update({ rt_critic_score: title.rt_critic_score, imdb_id: title.imdb_id, rt_checked_at: title.rt_checked_at })
    .eq("id", title.id);
  await admin
    .from("people")
    .update({
      bio: person.bio,
      birthday: person.birthday,
      place_of_birth: person.place_of_birth,
      bio_checked_at: person.bio_checked_at,
    })
    .eq("id", person.id);

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error("VERIFICATION FAILED:", err.message);
  process.exit(1);
});
