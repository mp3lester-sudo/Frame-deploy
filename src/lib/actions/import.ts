"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { parseLetterboxdCsv, buildTitleIndex, matchTitle, type LetterboxdRow } from "@/lib/import/letterboxd";
import { parseLetterboxdDiaryPaste } from "@/lib/import/letterboxd-paste";

async function requireUser() {
  const supabase = await createClient();
  // Trusts the user middleware already verified for this request (see
  // src/lib/auth/verified-user.ts) instead of calling
  // supabase.auth.getUser() again — that's a real network round trip to
  // Supabase's Auth server, so re-deriving it here on top of middleware
  // (and again after this action's revalidatePath re-renders the layout)
  // was tripling that latency on every single mutating button.
  const user = await getVerifiedUser();
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

/**
 * Next.js redacts any error *thrown* from a Server Action in production
 * down to a generic "An error occurred in the Server Components render"
 * message with no detail — by design, to avoid leaking internals, but it
 * also means a real bug (or even an expected validation message like
 * "upload at least one file") is completely invisible to the user and to
 * us. This return type sidesteps that: known failures are returned as a
 * normal value instead of thrown, so their message actually reaches the
 * client. Only a handful of truly-unexpected throws (e.g. auth failing
 * outright) still go through Next's generic path, which is an acceptable
 * fallback for cases we can't label with a useful message anyway.
 */
export type ImportResult = { ok: true; summary: ImportSummary } | { ok: false; error: string };

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

  // Only fetch titles whose name could plausibly match one of the rows
  // being imported, via a single RPC (migration 0019), rather than pulling
  // the entire catalogue (36.5k+ rows, ~37 paginated requests) into JS on
  // every import call regardless of how many rows are actually being
  // matched. That full-catalogue fetch alone took ~5.3s against the live
  // catalogue — enough on its own to blow past Vercel's serverless
  // function timeout (5-10s on the Hobby plan, no maxDuration override
  // configured), which fails with an opaque, digest-only "Server
  // Components render" error rather than anything that hints at a timeout.
  const distinctNames = [...new Set(rows.map((r) => r.name))];
  const { data: candidateTitles, error: titlesError } = await supabase.rpc("titles_matching_names", {
    p_names: distinctNames,
  });
  if (titlesError) throw new Error(titlesError.message);

  const index = buildTitleIndex(
    (candidateTitles ?? []) as { id: string; name: string; release_date: string | null }[]
  );

  const ratingUpserts: { user_id: string; title_id: string; score: number; rated_at?: string }[] = [];
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
      // rated_at omitted (not undefined-spread -- Postgres/PostgREST
      // just uses the column default, now()) when Letterboxd's export
      // didn't have a usable Date for this row, same behavior as before
      // this field existed.
      ratingUpserts.push({
        user_id: userId,
        title_id: titleId,
        score: row.rating,
        ...(row.watchedAt ? { rated_at: row.watchedAt } : {}),
      });
      ratedCount++;
    } else {
      watchedOnlyCount++;
    }
  }

  // A rewatch shows up in a diary as two separate entries for the same
  // film (e.g. logged again a year later) — both parse to the same
  // title_id here. Left as-is, that puts two rows for the same
  // (user_id, title_id) in a single insert/upsert call, which Postgres
  // rejects outright: a plain multi-row INSERT hits the unique constraint
  // because `now()` is evaluated once per statement (both rows get the
  // *same* watched_at), and an upsert with two conflicting rows in one
  // call fails with "ON CONFLICT DO UPDATE command cannot affect row a
  // second time" regardless. Collapse each array to one row per title_id
  // before writing — first occurrence wins, which (diary pages sort
  // newest-first by default) is normally the most recent watch/rating.
  const dedupeByTitleId = <T extends { title_id: string }>(items: T[]): T[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.title_id)) return false;
      seen.add(item.title_id);
      return true;
    });
  };
  const dedupedWatchUpserts = dedupeByTitleId(watchUpserts);
  const dedupedRatingUpserts = dedupeByTitleId(ratingUpserts);

  // watch_history's unique constraint is (user_id, title_id, watched_at) —
  // watched_at isn't something this import captures per-row, so every
  // insert would otherwise get a fresh now() and never collide, silently
  // creating a duplicate "watched" row every time an import is re-run
  // (contrary to this function's "safe to re-run" doc comment above).
  // Fetch the user's existing watched title_ids up front and skip ones
  // already on record instead.
  const distinctTitleIds = [...new Set(dedupedWatchUpserts.map((w) => w.title_id))];
  const alreadyWatched = new Set<string>();
  const ID_CHUNK = 500;
  for (let i = 0; i < distinctTitleIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from("watch_history")
      .select("title_id")
      .eq("user_id", userId)
      .in("title_id", distinctTitleIds.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`watch_history lookup failed: ${error.message}`);
    for (const row of data ?? []) alreadyWatched.add(row.title_id);
  }
  const newWatchUpserts = dedupedWatchUpserts.filter((w) => !alreadyWatched.has(w.title_id));

  const CHUNK = 500;
  for (let i = 0; i < newWatchUpserts.length; i += CHUNK) {
    const { error } = await supabase.from("watch_history").insert(newWatchUpserts.slice(i, i + CHUNK));
    if (error) throw new Error(`watch_history import failed: ${error.message}`);
  }
  for (let i = 0; i < dedupedRatingUpserts.length; i += CHUNK) {
    // Without an explicit onConflict target, PostgREST resolves upsert
    // conflicts against the table's primary key (id) — which a fresh
    // insert always has a brand-new value for, so it never actually
    // matches. That silently turns this into a plain INSERT, which then
    // hits the *real* unique constraint on (user_id, title_id) — the one
    // that fires for anyone importing a title they already have a rating
    // for from any source (onboarding, a prior partial import, manually
    // rating it in Backlot) — and throws a raw Postgres duplicate-key
    // error instead of updating the score like the "safe to re-run" doc
    // comment above promises. This was the actual cause of every real
    // import failing: onConflict has to name the constraint's columns
    // explicitly for Postgres to UPDATE instead of erroring.
    const { error } = await supabase
      .from("ratings")
      .upsert(dedupedRatingUpserts.slice(i, i + CHUNK), { onConflict: "user_id,title_id" });
    if (error) throw new Error(`ratings import failed: ${error.message}`);
  }

  // A bulk import is exactly the kind of curation the recommendation engine
  // is supposed to care most about — hundreds of explicit ratings in one
  // go — but this function used to never touch taste_vectors at all, so an
  // imported history contributed nothing to recommendations until the user
  // happened to rate something new inside Backlot itself. Recompute once,
  // after all rows are written, rather than once per row (see migration
  // 0031 — recompute_taste_vector_for_user rebuilds fresh from every 4-5
  // star rating, so a single call already reflects the whole import).
  if (dedupedRatingUpserts.length > 0) {
    const { error } = await supabase.rpc("recompute_taste_vector_for_user", { p_user_id: userId });
    if (error) {
      // Don't fail the whole import over this — the ratings themselves are
      // already safely written, and a stale/missing taste vector just means
      // recommendations lag behind until the next rating or import.
      console.error("recompute_taste_vector_for_user failed after import:", error.message);
    }
  }

  return {
    totalRows: rows.length,
    matched: ratedCount + watchedOnlyCount,
    rated: ratedCount,
    watchedOnly: watchedOnlyCount,
    unmatchedSample: unmatched.slice(0, 50),
  };
}

export async function importLetterboxdData(formData: FormData): Promise<ImportResult> {
  try {
    const { supabase, user } = await requireUser();

    const [ratingsCsv, watchedCsv] = await Promise.all([
      readCsvFile(formData.get("ratingsFile")),
      readCsvFile(formData.get("watchedFile")),
    ]);
    if (!ratingsCsv && !watchedCsv) {
      return { ok: false, error: "Upload at least one file (ratings.csv or watched.csv)" };
    }

    const ratingsRows = ratingsCsv ? parseLetterboxdCsv(ratingsCsv) : [];
    const watchedRows = watchedCsv ? parseLetterboxdCsv(watchedCsv) : [];

    // ratings.csv takes precedence when a film appears in both files.
    const byKey = new Map<string, LetterboxdRow>();
    for (const row of watchedRows) byKey.set(`${row.name.toLowerCase()}|${row.year}`, row);
    for (const row of ratingsRows) byKey.set(`${row.name.toLowerCase()}|${row.year}`, row);
    const rows = [...byKey.values()];

    const summary = await matchAndUpsertRows(supabase, user.id, rows);
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed" };
  }
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
export async function importLetterboxdPaste(html: string): Promise<ImportResult> {
  try {
    const { supabase, user } = await requireUser();

    if (!html || !html.trim()) return { ok: false, error: "Paste your Diary page's HTML source first" };
    if (html.length > MAX_PASTE_CHARS) {
      return { ok: false, error: "That's a lot of HTML — try pasting one Diary page at a time" };
    }

    const rows = parseLetterboxdDiaryPaste(html);
    if (rows.length === 0) {
      return {
        ok: false,
        error:
          "Couldn't find any diary entries in that paste — make sure you copied the page source (View Page Source or Ctrl/Cmd+S) of your Letterboxd Diary page, not just the visible text",
      };
    }

    const summary = await matchAndUpsertRows(supabase, user.id, rows);
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed" };
  }
}
