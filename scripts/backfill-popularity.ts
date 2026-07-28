/**
 * One-time backfill for the `popularity` column added in migration
 * 0008_title_popularity.sql. Every title already ingested (see
 * scripts/ingest-tmdb.ts) predates that column, so this fetches TMDB's
 * current `popularity` score for each existing title (by tmdb_id) and fills
 * it in. Going forward, ingest-tmdb.ts stores it on every new title, so this
 * script only needs to run once against the existing catalogue — but it's
 * safe to re-run (e.g. to refresh popularity rankings later), since it just
 * overwrites the column for whatever titles it's given.
 *
 * Only processes titles where popularity IS NULL, so it's resumable — safe
 * to re-run (e.g. after a timeout) and it'll just pick up wherever it left
 * off, one page (<=1000, PostgREST's row cap) at a time.
 *
 * Usage:
 *   npm run backfill:popularity              (processes up to 1000 pending; re-run until "0 pending")
 *   npm run backfill:popularity -- --limit=100   (smoke test on a subset)
 */
import { createClient } from "@supabase/supabase-js";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TMDB_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing TMDB_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const TMDB_BASE = "https://api.themoviedb.org/3";
const CONCURRENCY = 8;

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
  );
  return { limit: args.limit ? Number(args.limit) : undefined };
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
      }
    })
  );
}

type Title = { id: string; tmdb_id: number; name: string };

async function backfillOne(title: Title) {
  const res = await fetch(`${TMDB_BASE}/movie/${title.tmdb_id}?api_key=${TMDB_API_KEY}`);
  if (!res.ok) throw new Error(`TMDB /movie/${title.tmdb_id} -> ${res.status}`);
  const details = await res.json();

  const { error } = await supabase
    .from("titles")
    .update({ popularity: details.popularity ?? null })
    .eq("id", title.id);
  if (error) throw new Error(`update failed: ${error.message}`);
}

async function main() {
  const { limit } = parseArgs();

  const query = supabase
    .from("titles")
    .select("id, tmdb_id, name")
    .not("tmdb_id", "is", null)
    .is("popularity", null)
    .limit(limit ?? 1000);
  const { data: titles, error } = await query;
  if (error) throw new Error(error.message);

  const pending = (titles ?? []) as Title[];
  if (pending.length === 0) {
    console.log("0 pending — nothing to do.");
    return;
  }
  console.log(`Backfilling popularity for ${pending.length} titles (this page)...`);

  let ok = 0;
  let failed = 0;
  await runWithConcurrency(pending, CONCURRENCY, async (title) => {
    try {
      await backfillOne(title);
      ok++;
      if (ok % 200 === 0) console.log(`  ...${ok}/${pending.length}`);
    } catch (e) {
      failed++;
      console.error(`  FAIL ${title.name} (tmdb_id=${title.tmdb_id}):`, e instanceof Error ? e.message : e);
    }
  });

  console.log(`Done. ${ok} updated, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
