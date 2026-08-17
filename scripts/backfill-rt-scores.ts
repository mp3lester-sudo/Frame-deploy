/**
 * Backfill script -- proactively populates titles.rt_critic_score for
 * movies that have never had a page view (getOrFetchRtCriticScore in
 * src/lib/external/rotten-tomatoes.ts only fetches lazily, on the first
 * view of a given movie's detail page, so most of the catalogue has never
 * been checked at all).
 *
 * This exists because the recommendation engine's hard quality floor
 * (passesQualityFloor, src/lib/recommendations/quality-weighting.ts)
 * already refuses to recommend anything without a decent weighted_rating
 * even with zero RT data -- so "never recommend a bad movie" is enforced
 * either way -- but RT critic score catches a real, additional class of
 * bad recommendation the audience-only weighted_rating misses: a title
 * that's merely mediocre by audience vote but was a genuine critical bomb
 * (see quality-weighting.ts's Death Wish 2018 example, RT 18% but
 * weighted_rating 6.46). The wider the RT coverage, the more of that
 * gap gets closed instead of waiting on organic page views.
 *
 * OMDb's free tier caps at 1,000 requests/day and the movie catalogue is
 * tens of thousands of titles, so this is NOT a one-shot job -- it's meant
 * to be re-run daily (cron, or by hand) same as scripts/enrich-titles.ts,
 * and picks up wherever it left off since it only ever touches movies
 * where rt_checked_at IS NULL. Ordered by popularity descending so the
 * titles real users are most likely to actually see get covered first.
 *
 * Usage:
 *   npm run backfill:rt-scores -- --limit=950
 *   npm run backfill:rt-scores -- --limit=20 --dry-run   (sanity check first)
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!OMDB_API_KEY) {
  console.error("Missing OMDB_API_KEY -- get one free at https://www.omdbapi.com/apikey.aspx");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Free-tier OMDb caps at 1,000/day. Defaulting to 900 leaves headroom for
// organic on-view lookups (getOrFetchRtCriticScore) hitting the same key
// on the same day, so this backfill doesn't starve real user traffic of
// its own daily allowance.
const DEFAULT_LIMIT = 900;
// A small gap between requests so a 900-request run doesn't fire as a
// tight burst -- OMDb doesn't publish a per-second rate limit, but this
// is cheap insurance against tripping one.
const REQUEST_DELAY_MS = 150;

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
  );
  return {
    limit: Number(args.limit ?? DEFAULT_LIMIT),
    dryRun: args["dry-run"] === "true",
  };
}

type PendingTitle = {
  id: string;
  name: string;
  release_date: string | null;
};

async function fetchRtScore(name: string, releaseYear: string | undefined): Promise<{ rtScore: number | null; imdbId: string | null }> {
  const params = new URLSearchParams({ apikey: OMDB_API_KEY!, t: name });
  if (releaseYear) params.set("y", releaseYear);

  const res = await fetch(`https://www.omdbapi.com/?${params.toString()}`);
  const data = await res.json();

  if (data?.Response !== "True") return { rtScore: null, imdbId: null };

  const imdbId: string | null = data.imdbID ?? null;
  const ratings: { Source: string; Value: string }[] = data.Ratings ?? [];
  const rt = ratings.find((r) => r.Source === "Rotten Tomatoes");
  if (!rt) return { rtScore: null, imdbId };

  const parsed = parseInt(rt.Value.replace("%", ""), 10);
  return { rtScore: Number.isNaN(parsed) ? null : parsed, imdbId };
}

async function main() {
  const { limit, dryRun } = parseArgs();

  const { count: totalMovies } = await supabase
    .from("titles")
    .select("id", { count: "exact", head: true })
    .eq("type", "movie");
  const { count: pendingTotal } = await supabase
    .from("titles")
    .select("id", { count: "exact", head: true })
    .eq("type", "movie")
    .is("rt_checked_at", null);

  console.log(`Movies in catalogue: ${totalMovies ?? "?"}`);
  console.log(`Never checked for an RT score: ${pendingTotal ?? "?"}`);
  console.log(`Processing up to ${limit} this run${dryRun ? " (dry run -- no writes)" : ""}...\n`);

  const { data: pending, error } = await supabase
    .from("titles")
    .select("id, name, release_date")
    .eq("type", "movie")
    .is("rt_checked_at", null)
    .order("popularity", { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<PendingTitle[]>();

  if (error) {
    console.error("Failed to fetch pending titles:", error.message);
    process.exit(1);
  }
  if (!pending || pending.length === 0) {
    console.log("Nothing pending -- every movie has been checked at least once.");
    return;
  }

  let found = 0;
  let confirmedNoRtCoverage = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i++) {
    const title = pending[i];
    const year = title.release_date?.slice(0, 4);
    process.stdout.write(`[${i + 1}/${pending.length}] ${title.name}${year ? ` (${year})` : ""} ... `);

    try {
      const { rtScore, imdbId } = await fetchRtScore(title.name, year);
      if (rtScore != null) {
        found++;
        console.log(`${rtScore}%`);
      } else {
        confirmedNoRtCoverage++;
        console.log("no RT score (cached as checked so we don't re-hit it)");
      }

      if (!dryRun) {
        await supabase
          .from("titles")
          .update({
            rt_critic_score: rtScore,
            imdb_id: imdbId,
            rt_checked_at: new Date().toISOString(),
          })
          .eq("id", title.id);
      }
    } catch (err) {
      failed++;
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      // Deliberately don't write rt_checked_at on a network/API failure --
      // same "don't cache a miss you're not sure about" rule
      // getOrFetchRtCriticScore follows -- so this title stays eligible
      // for the next run instead of being silently skipped forever.
    }

    if (i < pending.length - 1) await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }

  console.log(`\nDone. ${found} scores found, ${confirmedNoRtCoverage} confirmed no RT coverage, ${failed} failed (will retry next run).`);
  const remaining = (pendingTotal ?? 0) - found - confirmedNoRtCoverage;
  if (remaining > 0) {
    console.log(`~${remaining} movies still unchecked -- re-run this script (same command) to continue, one OMDb-quota's worth at a time.`);
  }
}

main();
