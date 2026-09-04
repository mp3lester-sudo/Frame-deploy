/**
 * Diagnostic + fix for a live bug report: "Suits" (the TV show) showing
 * up on the Movies tab. Every code path that filters by media_type
 * (match_titles_for_user's `t.type = p_media_type`, Discover/Search's
 * `.eq("type", mediaType)`, the hard quality floor in engine.ts) is
 * correct and already verified -- so if a title with this name is
 * showing up under type='movie', the title ITSELF is almost certainly
 * mistagged or a junk duplicate in the catalogue, not a filtering bug.
 *
 * TMDB confirms this: alongside the real TV series (tv/37680) and a
 * genuine 1999 movie also named "Suits" (movie/159734), there's a third,
 * clearly-junk TMDB entry -- movie/1527093 -- that's a near-empty stub
 * carrying the TV show's own synopsis ("Harvey Specter... Mike Ross...
 * Pearson Hardman") under type=movie. If a broad `--type=movie
 * --list=discover` ingestion sweep (task #68/#535's catalogue expansion)
 * picked this up, it would sit in the movie catalogue under the exact
 * name "Suits" with the TV show's own plot -- exactly what the bug
 * report describes.
 *
 * Usage:
 *   npm run find:junk-titles                                    -- lists matches, deletes nothing
 *   npm run find:junk-titles -- --delete=<id>                    -- deletes one confirmed junk row +
 *                                                                    its title_embeddings/title_credits,
 *                                                                    but refuses if any user has ever
 *                                                                    rated, reviewed, watchlisted, or
 *                                                                    favorited it
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const deleteArg = process.argv.find((a) => a.startsWith("--delete="));

  if (!deleteArg) {
    const { data, error } = await supabase
      .from("titles")
      .select("id, name, type, tmdb_id, weighted_rating, overview, release_date, poster_url")
      .ilike("name", "%suits%")
      .order("type", { ascending: true });

    if (error) {
      console.error("Query failed:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) {
      console.log("No titles matching 'suits' found.");
      return;
    }

    console.log(`Found ${data.length} title(s) matching 'suits':\n`);
    for (const t of data) {
      console.log(
        `id=${t.id}\n  name=${t.name}\n  type=${t.type}\n  tmdb_id=${t.tmdb_id}\n  weighted_rating=${t.weighted_rating}\n  release_date=${t.release_date}\n  overview="${(t.overview ?? "").slice(0, 140)}"\n  poster_url=${t.poster_url ? "yes" : "MISSING"}\n`
      );
    }
    console.log(
      "Look for a type='movie' row whose overview describes the TV show's own plot (Harvey Specter/Mike Ross/Pearson Hardman) -- that's the junk stub. Confirm its id, then re-run with --delete=<id>."
    );
    return;
  }

  const id = deleteArg.split("=")[1];
  if (!id) {
    console.error("Usage: --delete=<title-id>");
    process.exit(1);
  }

  // Refuse to delete anything with real user engagement -- this script is
  // only for a confirmed junk/duplicate catalogue entry, never a title a
  // real user has actually interacted with.
  const engagementChecks = await Promise.all([
    supabase.from("ratings").select("id", { count: "exact", head: true }).eq("title_id", id),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("title_id", id),
    supabase.from("watchlist").select("id", { count: "exact", head: true }).eq("title_id", id),
    supabase.from("favorite_titles").select("id", { count: "exact", head: true }).eq("title_id", id),
    supabase.from("watch_history").select("id", { count: "exact", head: true }).eq("title_id", id),
  ]);

  const totalEngagement = engagementChecks.reduce((sum, r) => sum + (r.count ?? 0), 0);
  if (totalEngagement > 0) {
    console.error(
      `Refusing to delete: ${totalEngagement} row(s) of real user engagement (ratings/reviews/watchlist/favorites/watch_history) reference this title. This isn't a junk stub -- investigate further before touching it.`
    );
    process.exit(1);
  }

  const { data: title } = await supabase.from("titles").select("name, type, tmdb_id").eq("id", id).maybeSingle();
  if (!title) {
    console.error("No title found with that id.");
    process.exit(1);
  }

  console.log(`Deleting: ${title.name} (${title.type}, tmdb_id=${title.tmdb_id})...`);

  await supabase.from("title_embeddings").delete().eq("title_id", id);
  await supabase.from("title_credits").delete().eq("title_id", id);
  await supabase.from("title_dismissals").delete().eq("title_id", id);
  const { error: delError } = await supabase.from("titles").delete().eq("id", id);

  if (delError) {
    console.error("Delete failed:", delError.message);
    process.exit(1);
  }
  console.log("Done. Removed from the catalogue -- it will no longer appear in Discover, Search, or recommendations.");
}

main();
