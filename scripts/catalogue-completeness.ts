/**
 * Read-only catalogue health report -- what the launch-readiness audit
 * flagged as missing: no way to see, without hand-writing SQL, what
 * fraction of the ~36k-title catalogue is actually launch-ready (has a
 * poster, has real AI-derived taste metadata, has an embedding so it's
 * reachable by the recommendation engine at all).
 *
 * All counts use head:true/count:"exact" selects (no rows transferred),
 * so this stays cheap even at full catalogue size. Never writes anything.
 *
 * Usage: npm run report:catalogue
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient<any>(url, serviceKey);

async function count(builder: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: n, error } = await builder;
  if (error) throw new Error(error.message);
  return n ?? 0;
}

async function main() {
  const total = await count(supabase.from("titles").select("*", { count: "exact", head: true }));
  if (total === 0) {
    console.log("titles table is empty -- nothing to report.");
    return;
  }

  const missingPoster = await count(
    supabase.from("titles").select("*", { count: "exact", head: true }).is("poster_url", null)
  );
  const missingBackdrop = await count(
    supabase.from("titles").select("*", { count: "exact", head: true }).is("backdrop_url", null)
  );
  const missingOverview = await count(
    supabase.from("titles").select("*", { count: "exact", head: true }).or("overview.is.null,overview.eq.")
  );
  const missingRuntime = await count(
    supabase.from("titles").select("*", { count: "exact", head: true }).is("runtime_minutes", null)
  );
  // Placeholder taste data left by ingest-tmdb.ts's emptyTaste fallback
  // (see the fix in ingestOne: embedding is now gated on tasteStatus ===
  // "ok", so titles matching this shouldn't newly accumulate an embedding
  // going forward -- but older rows ingested before that fix may still be
  // sitting on this exact placeholder combination).
  const placeholderTaste = await count(
    supabase
      .from("titles")
      .select("*", { count: "exact", head: true })
      .eq("pacing", "moderate")
      .eq("violence_level", 0)
      .eq("comedy_level", 0)
      .eq("emotional_intensity", 0)
      .eq("dialogue_density", 0)
  );
  const embeddings = await count(supabase.from("title_embeddings").select("*", { count: "exact", head: true }));
  const pendingEnrichment = total - embeddings;

  // RT (Rotten Tomatoes critic score) only exists for movies -- OMDb, the
  // only workable RT data source, has zero TV Tomatometer coverage (see
  // src/lib/external/rotten-tomatoes.ts). Scored separately as a fraction
  // of MOVIES, not the whole catalogue, so this number stays meaningful
  // as TV's share of the catalogue grows.
  const moviesTotal = await count(supabase.from("titles").select("*", { count: "exact", head: true }).eq("type", "movie"));
  const moviesMissingRt = await count(
    supabase.from("titles").select("*", { count: "exact", head: true }).eq("type", "movie").is("rt_checked_at", null)
  );

  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  const pctOfMovies = (n: number) => (moviesTotal === 0 ? "n/a" : `${((n / moviesTotal) * 100).toFixed(1)}%`);

  console.log(`Catalogue completeness report (${total} titles)\n`);
  console.log(`  Missing poster:              ${missingPoster.toString().padStart(6)}  (${pct(missingPoster)})`);
  console.log(`  Missing backdrop:            ${missingBackdrop.toString().padStart(6)}  (${pct(missingBackdrop)})`);
  console.log(`  Missing overview:            ${missingOverview.toString().padStart(6)}  (${pct(missingOverview)})`);
  console.log(`  Missing runtime:             ${missingRuntime.toString().padStart(6)}  (${pct(missingRuntime)})`);
  console.log(`  No embedding yet (pending):  ${pendingEnrichment.toString().padStart(6)}  (${pct(pendingEnrichment)})`);
  console.log(`  Suspicious placeholder taste:${placeholderTaste.toString().padStart(6)}  (${pct(placeholderTaste)})`);
  console.log(
    `  Movies never RT-checked:     ${moviesMissingRt.toString().padStart(6)}  (${pctOfMovies(moviesMissingRt)} of ${moviesTotal} movies)`
  );
  console.log(
    "\nRun `npm run enrich:titles` to work through the pending-enrichment backlog (ordered by popularity, " +
      "so the titles users are most likely to see get fixed first). Placeholder-taste rows won't be picked " +
      "up automatically if they already have an embedding -- see pending_enrichment_titles (migration 0018) " +
      "-- those may need a manual re-enrichment pass if the count above is non-trivial.\n" +
      "Run `npm run backfill:rt-scores` to work through the RT-score backlog -- OMDb's free tier caps at " +
      "1,000 requests/day, so this needs re-running (same command) once a day until the count above hits 0."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
