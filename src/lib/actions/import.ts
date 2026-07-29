"use server";

import { createClient } from "@/lib/supabase/server";
import { parseLetterboxdCsv, buildTitleIndex, matchTitle, type LetterboxdRow } from "@/lib/import/letterboxd";
import { parseLetterboxdDiaryPaste } from "@/lib/import/letterboxd-paste";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB — generous; Letterboxd's own importer caps at 1MB
const MAX_ROWS = 20_000;

export interface ImportSummary {
  totalRows: number;
  matched: number;
  rated: number;
  watchedOnly: number;
  unmatchedSample: { name: string; year: number | null }[];
}

function readCsvFile(file: FormDataEntryValue | null): Promise<string> {
  if (!(file instanceof File)) return Promise.resolve("");
  if (file.size === 0) return Promise.resolve("");
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name || "File"} is too large (max 2MB)`);
  return file.text();
}

/**
 * Imports a Letterboxd export (ratings.csv and/or watched.csv — see
 * src/lib/import/letterboxd.ts for the exact format and why matching is
 * title+year rather than an ID lookup) into ratings/watch_history.
 *
 * Deliberately does NOT write any activity_events — for an account with
 * thousands of logged films, one event per title would flood the social
 * feed of anyone following this user, and none of the existing event types
 * ("rated", "watched", etc, which all expect a specific title) fit a bulk
 * "imported N films" summary cleanly enough to fake one.
 *
 * Safe to re-run: ratings/watch_history are upserted on their existing
 * unique constraints, so importing the same file twice just re-applies the
 * same values rather than creating duplicates.
 */
async function matchAndUpsertRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rows: LetterboxdRow[]
): Promise<ImportSummary> {
  if (rows.length > MAX_ROWS) throw new Error(`That's ${rows.length} rows — please split into smaller batches under ${MAX_ROWS}`);

  // Pull the whole catalogue once (tens of thousands of rows) rather than
  // querying per row — this is the difference between one paginated fetch
  // and thousands of queries. Paginated via .range() because PostgREST caps
  // an unbounded .select() at 1000 rows, and the catalogue is well past
  // that now.
  const allTitles: { id: string; name: string; release_date: string | null }[] = [];
  const PAGE_SIZE = 1000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: page, error: titlesError } = await supabase
      .from("titles")
      .select("id, name, release_date")
      .range(offset, offset + PAGE_SIZE - 1);
    if (titlesError) throw new Error(titlesError.message);
    if (!page || page.length === 0) break;
    allTitles.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const index = buildTitleIndex(allTitles);

  const ratingUpserts: { user_id: string; title_id: string; score: number }[] = [];
  const watchUpserts: { user_id: string; title_id: string }[] = [];
  const unmatched: { name: string; year: number | null }[] = [];
  let ratedCount = 0;
  let watchedOnlyCount = 0;

  for (const row of rows) {
    const titleId = matchTitle(row, index);
    if (!titleId) {
      unmatched.push({ name: row.name, year: row.year });
      continue;
    }
    watchUpserts.push({ user_id: userId, title_id: titleId });
    if (row.rating !== null) {
      ratingUpserts.push({ user_id: userId, title_id: titleId, score: row.rating });
      ratedCount++;
    } else {
      watchedOnlyCount++;
    }
  }

  const CHUNK = 500;
  for (let i = 0; i < watchUpserts.length; i += CHUNK) {
    const { error } = await supabase.from("watch_history").upsert(watchUpserts.slice(i, i + CHUNK));
    if (error) throw new Error(`watch_history import failed: ${error.message}`);
  }
  for (let i = 0; i < ratingUpserts.length; i += CHUNK) {
    const { error } = await supabase.from("ratings").upsert(ratingUpserts.slice(i, i + CHUNK));
    if (error) throw new Error(`ratings import failed: ${error.message}`);
  }

  return {
    totalRows: rows.length,
    matched: ratedCount + watchedOnlyCount,
    rated: ratedCount,
    watchedOnly: watchedOnlyCount,
    unmatchedSample: unmatched.slice(0, 50),
  };
}

export async function importLetterboxdData(formData: FormData): Promise<ImportSummary> {
  const { supabase, user } = await requireUser();

  const [ratingsCsv, watchedCsv] = await Promise.all([
    readCsvFile(formData.get("ratingsFile")),
    readCsvFile(formData.get("watchedFile")),
  ]);
  if (!ratingsCsv && !watchedCsv) throw new Error("Upload at least one file (ratings.csv or watched.csv)");

  const ratingsRows = ratingsCsv ? parseLetterboxdCsv(ratingsCsv) : [];
  const watchedRows = watchedCsv ? parseLetterboxdCsv(watchedCsv) : [];

  // ratings.csv takes precedence when a film appears in both files.
  const byKey = new Map<string, LetterboxdRow>();
  for (const row of watchedRows) byKey.set(`${row.name.toLowerCase()}|${row.year}`, row);
  for (const row of ratingsRows) byKey.set(`${row.name.toLowerCase()}|${row.year}`, row);
  const rows = [...byKey.values()];

  return matchAndUpsertRows(supabase, user.id, rows);
}

const MAX_PASTE_CHARS = 3 * 1024 * 1024; // a full diary page's HTML source runs well under this

/**
 * Import path for members without Letterboxd Pro (whose CSV export is
 * locked behind Settings -> Data). Instead of a file, this takes the raw
 * page source of the member's own Diary page — pasted from their own
 * browser, which sails past Letterboxd's Cloudflare bot-protection since
 * it's a real signed-in session, not a server-side fetch on our end. See
 * src/lib/import/letterboxd-paste.ts for how the HTML is parsed.
 *
 * Diary pages paginate at ~50 entries, so a long history requires pasting
 * multiple pages one at a time; each call here is independently idempotent
 * (same upsert-on-conflict behavior as the CSV path), so re-pasting a page
 * or pasting overlapping pages is harmless.
 */
export async function importLetterboxdPaste(html: string): Promise<ImportSummary> {
  const { supabase, user } = await requireUser();

  if (!html || !html.trim()) throw new Error("Paste your Diary page's HTML source first");
  if (html.length > MAX_PASTE_CHARS) throw new Error("That's a lot of HTML — try pasting one Diary page at a time");

  const rows = parseLetterboxdDiaryPaste(html);
  if (rows.length === 0) {
    throw new Error(
      "Couldn't find any diary entries in that paste — make sure you copied the page source (View Page Source) of your Letterboxd Diary page, not just the visible text"
    );
  }

  return matchAndUpsertRows(supabase, user.id, rows);
}
