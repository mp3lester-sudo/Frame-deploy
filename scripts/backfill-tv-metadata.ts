/**
 * One-time backfill for the TV metadata columns and 'creator' credit type
 * added in migration 0073_tv_show_metadata_and_creator_credit.sql
 * (number_of_seasons, number_of_episodes, in_production, tv_status,
 * next_episode_air_date on public.titles; credit_type = 'creator' on
 * public.title_credits). ingest-tmdb.ts persists both of these for every
 * *new* TV ingestion as of task #539, but every TV title ingested before
 * that change — the existing ~5,719-row TV catalogue — has NULL metadata
 * columns and no creator credit row. This backfills exactly those two
 * things for those pre-existing rows, reusing the same TMDB /tv/{id}
 * response (append_to_response=credits) and the same field mapping
 * ingestOne uses in scripts/ingest-tmdb.ts, so a title backfilled here is
 * indistinguishable from one ingested fresh today.
 *
 * Only processes TV titles where number_of_seasons IS NULL -- in
 * ingest-tmdb.ts the five metadata columns are always written together in
 * one Object.assign (never individually), so a NULL number_of_seasons
 * reliably means "predates task #539" and this row's creator credit (if
 * TMDB reports one) is missing too. That makes this resumable for free:
 * safe to re-run after a timeout or a partial page, since a title drops
 * out of the pending set the moment its metadata is written, regardless
 * of whether the creator-credit half of the same call also succeeded.
 *
 * Usage:
 *   npm run backfill:tv-metadata                 (processes up to 1000 pending; re-run until "0 pending")
 *   npm run backfill:tv-metadata -- --limit=50    (smoke test on a subset)
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
const IMAGE_BASE = "https://image.tmdb.org/t/p";
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
  const res = await fetch(
    `${TMDB_BASE}/tv/${title.tmdb_id}?api_key=${TMDB_API_KEY}&append_to_response=credits`
  );
  if (!res.ok) throw new Error(`TMDB /tv/${title.tmdb_id} -> ${res.status}`);
  const details = await res.json();

  const { error } = await supabase
    .from("titles")
    .update({
      number_of_seasons: details.number_of_seasons ?? null,
      number_of_episodes: details.number_of_episodes ?? null,
      in_production: details.in_production ?? null,
      tv_status: details.status ?? null,
      next_episode_air_date: details.next_episode_to_air?.air_date ?? null,
    })
    .eq("id", title.id);
  if (error) throw new Error(`update titles failed: ${error.message}`);

  // Creator (showrunner) credit -- same credit_type = 'creator' ingestOne
  // writes for new TV ingestions (migration 0073), deliberately never
  // 'director' (see that file's comment: a showrunner isn't what
  // "Director" means anywhere else in this app). Best-effort: a missing
  // or empty created_by shouldn't fail the metadata update above, which
  // is the more valuable half of this backfill.
  const createdBy: { id: number; name: string; profile_path: string | null }[] =
    details.created_by ?? [];
  for (let i = 0; i < createdBy.length; i++) {
    const person = createdBy[i];
    const { data: personRow, error: personErr } = await supabase
      .from("people")
      .upsert(
        {
          tmdb_id: person.id,
          name: person.name,
          photo_url: person.profile_path ? `${IMAGE_BASE}/w185${person.profile_path}` : null,
        },
        { onConflict: "tmdb_id" }
      )
      .select("id")
      .single();
    if (personErr || !personRow) continue;

    await supabase.from("title_credits").upsert(
      {
        title_id: title.id,
        person_id: personRow.id,
        credit_type: "creator",
        character_name: null,
        billing_order: i,
      },
      { onConflict: "title_id,person_id,credit_type" }
    );
  }
}

async function main() {
  const { limit } = parseArgs();

  const query = supabase
    .from("titles")
    .select("id, tmdb_id, name")
    .eq("type", "tv")
    .not("tmdb_id", "is", null)
    .is("number_of_seasons", null)
    .order("popularity", { ascending: false })
    .limit(limit ?? 1000);
  const { data: titles, error } = await query;
  if (error) throw new Error(error.message);

  const pending = (titles ?? []) as Title[];
  if (pending.length === 0) {
    console.log("0 pending — nothing to do.");
    return;
  }
  console.log(`Backfilling TV metadata for ${pending.length} titles (this page)...`);

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
