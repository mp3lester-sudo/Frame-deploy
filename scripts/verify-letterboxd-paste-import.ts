/**
 * End-to-end verification of the paste-based Letterboxd import (the
 * free-account alternative to the Pro-only CSV export) against the real
 * Supabase project. Mirrors verify-letterboxd-import.ts's structure, but
 * builds a synthetic Diary-page-shaped HTML blob (same row shape as the
 * fixtures in src/lib/import/__tests__/letterboxd-paste.test.ts) referencing
 * real catalogue titles, runs it through the actual parse + match + upsert
 * logic, and confirms: rated and unrated entries both land correctly,
 * a made-up title is reported unmatched, and re-importing the same page is
 * idempotent (no duplicate rows). Cleans up after itself.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { parseLetterboxdDiaryPaste } from "../src/lib/import/letterboxd-paste";
import { buildTitleIndex, matchTitle } from "../src/lib/import/letterboxd";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function diaryRow(opts: { slug: string; title: string; year: number; rating?: string }): string {
  const ratingCell = opts.rating
    ? `<td class="td-rating"><a href="#" title="Remove rating">×</a> ${opts.rating}</td>`
    : `<td class="td-rating"></td>`;
  return `
    <tr class="diary-entry-row">
      <td class="td-film-details">
        <a href="/someuser/film/${opts.slug}/">${opts.title}</a><a href="/films/year/${opts.year}/">${opts.year}</a>
      </td>
      ${ratingCell}
    </tr>`;
}

async function main() {
  const admin = createServiceClient(url, serviceKey);

  console.log("1. Creating a test user...");
  const email = `mp3lester+lbxpaste${Date.now()}@gmail.com`;
  const password = "TestPassword123!";
  const username = `lbxp_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);
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

  console.log("2. Picking two real catalogue titles...");
  const { data: realTitles } = await client.from("titles").select("id, name, release_date").limit(2);
  if (!realTitles || realTitles.length < 2) throw new Error("not enough titles in catalogue to test import");
  const [ratedTitle, watchedOnlyTitle] = realTitles;
  const ratedYear = Number(ratedTitle.release_date?.slice(0, 4) ?? "2000");
  const watchedYear = Number(watchedOnlyTitle.release_date?.slice(0, 4) ?? "2000");

  console.log("3. Building a synthetic diary-page paste referencing them, plus a made-up title...");
  const html = [
    diaryRow({ slug: "rated-slug", title: ratedTitle.name, year: ratedYear, rating: "★★★★" }),
    diaryRow({ slug: "watched-slug", title: watchedOnlyTitle.name, year: watchedYear }), // no rating
    diaryRow({ slug: "made-up-slug", title: "This Film Definitely Does Not Exist In Our Catalogue", year: 2019 }),
  ].join("\n");

  console.log("4. Parsing + matching (mirrors importLetterboxdPaste)...");
  const rows = parseLetterboxdDiaryPaste(html);
  if (rows.length !== 3) throw new Error(`expected 3 parsed rows, got ${rows.length}`);

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

  console.log("5. Applying the upserts...");
  await client.from("watch_history").upsert(watchUpserts);
  await client.from("ratings").upsert(ratingUpserts);

  console.log("6. Verifying the persisted result...");
  const { data: ratingsAfter } = await client.from("ratings").select("title_id, score").eq("user_id", userId);
  const { data: watchAfter } = await client.from("watch_history").select("title_id").eq("user_id", userId);

  const ratingByTitle = new Map((ratingsAfter ?? []).map((r) => [r.title_id, r.score]));
  if (ratingByTitle.get(ratedTitle.id) !== 4) throw new Error(`expected ratedTitle at 4, got ${ratingByTitle.get(ratedTitle.id)}`);
  if (ratingByTitle.has(watchedOnlyTitle.id)) throw new Error("watchedOnlyTitle should have no rating");

  const watchedIds = new Set((watchAfter ?? []).map((w) => w.title_id));
  for (const t of [ratedTitle, watchedOnlyTitle]) {
    if (!watchedIds.has(t.id)) throw new Error(`expected ${t.name} in watch_history`);
  }
  console.log("   ok — rated entry got its score, unrated entry is watched-only, both in watch history");

  console.log("7. Re-pasting the same page (idempotency check)...");
  await client.from("watch_history").upsert(watchUpserts);
  await client.from("ratings").upsert(ratingUpserts);
  const { count: ratingsCountAfterRerun } = await client
    .from("ratings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (ratingsCountAfterRerun !== 1) throw new Error(`expected re-pasting to stay at 1 rating, got ${ratingsCountAfterRerun}`);
  console.log("   ok — re-pasting the same page didn't create duplicates");

  console.log("8. Confirming a non-diary paste is rejected rather than silently importing nothing...");
  const bogusRows = parseLetterboxdDiaryPaste("<html><body>not a diary page</body></html>");
  if (bogusRows.length !== 0) throw new Error("expected zero rows parsed from a non-diary paste");
  console.log("   ok — parser returns empty for unrecognized markup (the action layer turns this into a clear error)");

  console.log("9. Cleaning up test user...");
  await admin.auth.admin.deleteUser(userId);

  console.log("\nAll Letterboxd paste-import checks passed.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
