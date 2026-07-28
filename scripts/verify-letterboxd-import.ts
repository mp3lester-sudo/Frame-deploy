/**
 * End-to-end verification of the Letterboxd import against the real
 * Supabase project. src/lib/actions/import.ts can't be called directly from
 * a standalone script (it goes through @/lib/supabase/server, which needs a
 * Next.js request/cookies context), so this mirrors its logic exactly using
 * the real pure functions from src/lib/import/letterboxd.ts plus a plain
 * supabase-js client — same pattern as the other verify-*.ts scripts.
 *
 * Builds two small CSVs (a ratings.csv and a watched.csv) referencing real
 * catalogue titles plus one deliberately made-up title, runs them through
 * the actual matching + upsert logic, and confirms: real titles end up
 * rated/watched correctly, watched.csv fills in a title with no rating,
 * ratings.csv wins when a title is in both files, and the made-up title is
 * reported unmatched rather than guessed at. Cleans up after itself.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { parseLetterboxdCsv, buildTitleIndex, matchTitle } from "../src/lib/import/letterboxd";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function csvEscape(value: string): string {
  return value.includes(",") ? `"${value}"` : value;
}

async function main() {
  const admin = createServiceClient(url, serviceKey);

  console.log("1. Creating a test user...");
  const email = `mp3lester+lbx${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `lbx_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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
  await client.from("profiles").insert({ id: userId, username, display_name: username });

  console.log("2. Picking three real catalogue titles + one made-up one...");
  const { data: realTitles } = await client.from("titles").select("id, name, release_date").limit(3);
  if (!realTitles || realTitles.length < 3) throw new Error("not enough titles in catalogue to test import");
  const [ratedTitle, watchedOnlyTitle, conflictTitle] = realTitles;
  const ratedYear = ratedTitle.release_date?.slice(0, 4) ?? "2000";
  const conflictYear = conflictTitle.release_date?.slice(0, 4) ?? "2000";

  // ratings.csv: rates ratedTitle 4.5, and rates conflictTitle 5 — this
  // should win over watched.csv's entry for the same film (no rating there).
  const ratingsCsv = [
    "Date,Name,Year,Letterboxd URI,Rating",
    `2024-01-01,${csvEscape(ratedTitle.name)},${ratedYear},https://letterboxd.com/film/x/,4.5`,
    `2024-01-02,${csvEscape(conflictTitle.name)},${conflictYear},https://letterboxd.com/film/y/,5`,
  ].join("\n");

  // watched.csv: watchedOnlyTitle with no rating, the made-up title (should
  // end up unmatched), and the same conflictTitle with no rating (ratings.csv
  // should win for it).
  const watchedYear = watchedOnlyTitle.release_date?.slice(0, 4) ?? "2000";
  const watchedCsv = [
    "Date,Name,Year,Letterboxd URI",
    `2024-01-03,${csvEscape(watchedOnlyTitle.name)},${watchedYear},https://letterboxd.com/film/z/`,
    `2024-01-04,This Film Definitely Does Not Exist In Our Catalogue,2019,https://letterboxd.com/film/nope/`,
    `2024-01-05,${csvEscape(conflictTitle.name)},${conflictYear},https://letterboxd.com/film/y/`,
  ].join("\n");

  console.log("3. Parsing + matching (mirrors importLetterboxdData)...");
  const ratingsRows = parseLetterboxdCsv(ratingsCsv);
  const watchedRows = parseLetterboxdCsv(watchedCsv);
  if (ratingsRows.length !== 2) throw new Error(`expected 2 ratings.csv rows, got ${ratingsRows.length}`);
  if (watchedRows.length !== 3) throw new Error(`expected 3 watched.csv rows, got ${watchedRows.length}`);

  const byKey = new Map<string, (typeof ratingsRows)[number]>();
  for (const row of watchedRows) byKey.set(`${row.name.toLowerCase()}|${row.year}`, row);
  for (const row of ratingsRows) byKey.set(`${row.name.toLowerCase()}|${row.year}`, row); // ratings.csv wins
  const rows = [...byKey.values()];

  const { data: allTitles } = await client.from("titles").select("id, name, release_date");
  const index = buildTitleIndex(allTitles ?? []);

  const ratingUpserts: { user_id: string; title_id: string; score: number }[] = [];
  const watchUpserts: { user_id: string; title_id: string }[] = [];
  const unmatched: string[] = [];
  for (const row of rows) {
    const titleId = matchTitle(row, index);
    if (!titleId) {
      unmatched.push(row.name);
      continue;
    }
    watchUpserts.push({ user_id: userId, title_id: titleId });
    if (row.rating !== null) ratingUpserts.push({ user_id: userId, title_id: titleId, score: row.rating });
  }

  if (unmatched.length !== 1 || !unmatched[0].includes("Does Not Exist")) {
    throw new Error(`expected exactly the made-up title to be unmatched, got: ${JSON.stringify(unmatched)}`);
  }
  console.log("   ok — the made-up title correctly came back unmatched");

  console.log("4. Applying the upserts...");
  await client.from("watch_history").upsert(watchUpserts);
  await client.from("ratings").upsert(ratingUpserts);

  console.log("5. Verifying the persisted result...");
  const { data: ratingsAfter } = await client.from("ratings").select("title_id, score").eq("user_id", userId);
  const { data: watchAfter } = await client.from("watch_history").select("title_id").eq("user_id", userId);

  const ratingByTitle = new Map((ratingsAfter ?? []).map((r) => [r.title_id, r.score]));
  if (ratingByTitle.get(ratedTitle.id) !== 4.5) throw new Error(`expected ratedTitle at 4.5, got ${ratingByTitle.get(ratedTitle.id)}`);
  if (ratingByTitle.get(conflictTitle.id) !== 5) {
    throw new Error(`expected ratings.csv's 5 to win for conflictTitle, got ${ratingByTitle.get(conflictTitle.id)}`);
  }
  if (ratingByTitle.has(watchedOnlyTitle.id)) throw new Error("watchedOnlyTitle should have no rating");

  const watchedIds = new Set((watchAfter ?? []).map((w) => w.title_id));
  for (const t of [ratedTitle, watchedOnlyTitle, conflictTitle]) {
    if (!watchedIds.has(t.id)) throw new Error(`expected ${t.name} in watch_history`);
  }
  console.log("   ok — ratings.csv won the conflict, watched-only title has no rating, all three in watch history");

  console.log("6. Re-running the same import (idempotency check)...");
  await client.from("watch_history").upsert(watchUpserts);
  await client.from("ratings").upsert(ratingUpserts);
  const { count: ratingsCountAfterRerun } = await client
    .from("ratings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (ratingsCountAfterRerun !== 2) throw new Error(`expected re-running the import to stay at 2 ratings, got ${ratingsCountAfterRerun}`);
  console.log("   ok — re-running the import didn't create duplicates");

  console.log("7. Cleaning up test user...");
  await admin.auth.admin.deleteUser(userId);

  console.log("\nAll Letterboxd import checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
