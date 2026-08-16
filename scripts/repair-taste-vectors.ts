/**
 * Repair script for two real gaps that can leave a user with real rating
 * history but no usable taste vector -- the exact symptom that shows up
 * as "nobody in the group has rated enough yet" on Movie Night/Date Night
 * even when both participants have hundreds of movies logged:
 *
 *  1. Reviews written before migration 0075 (or any review whose
 *     inferred_score call failed/was never run) sit at inferred_score =
 *     null forever -- migration 0075's own comment flagged this as a
 *     known, unbackfilled gap. A user whose Letterboxd history came in
 *     mostly as reviews rather than star ratings gets literally zero
 *     taste-vector contribution from that history until this runs.
 *  2. recompute_taste_vector_for_user can fail silently after a bulk
 *     Letterboxd import (import.ts used to only console.error, now
 *     captureServerError -- see that fix) or simply never have been
 *     triggered for some other write path. This force-recomputes EVERY
 *     user who has any ratings, favorite_titles, or reviews, not just
 *     users with zero vector rows -- a stale or partially-built vector
 *     (e.g. a 'movie' row that predates hundreds of later ratings) is
 *     just as broken as a missing one, and unlike backfill-taste-vectors.ts
 *     (which only replays users with NO vector at all), this is meant to
 *     be safe to re-run any time recommendations feel stale for reasons
 *     that don't reduce to "OpenAI billing wasn't on yet."
 *
 * Usage:
 *   npm run repair:taste-vectors
 *   npm run repair:taste-vectors -- --skip-sentiment   (step 1 needs
 *     OpenAI; skip it if you only want the recompute pass)
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const SKIP_SENTIMENT = process.argv.includes("--skip-sentiment");

async function backfillReviewSentiment() {
  // Dynamic import, not a top-level one: sentiment.ts pulls in
  // lib/ai/openai.ts, which imports the `server-only` marker package --
  // fine inside Next.js's server runtime, but that package intentionally
  // throws/doesn't resolve under a plain tsx script. Loading it lazily,
  // only when this step actually runs (i.e. not under --skip-sentiment),
  // keeps the recompute-only path usable without an OpenAI key at all.
  const { inferReviewSentimentScore } = await import("../src/lib/reviews/sentiment");
  // Only reviews with no rating on the same title even matter for the
  // taste vector (migration 0075's `reviewed` CTE only reads a review
  // when there's no explicit rating already covering that title) -- but
  // scoring every null-inferred_score review regardless is still correct
  // and cheaper to reason about than pre-filtering by rating overlap here;
  // the CTE itself does that filtering at read time.
  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("id, body")
    .is("inferred_score", null);
  if (error) throw new Error(error.message);

  const toScore = (reviews ?? []).filter((r) => r.body && r.body.trim().length > 0);
  console.log(`${toScore.length} reviews with no inferred_score yet.`);

  let scored = 0;
  let failed = 0;
  const CONCURRENCY = 5;
  for (let i = 0; i < toScore.length; i += CONCURRENCY) {
    const batch = toScore.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (r) => {
        const score = await inferReviewSentimentScore(r.body);
        if (score == null) {
          failed++;
          return;
        }
        const { error: updateError } = await supabase.from("reviews").update({ inferred_score: score }).eq("id", r.id);
        if (updateError) {
          failed++;
          console.error(`  FAIL update review=${r.id}:`, updateError.message);
        } else {
          scored++;
        }
      })
    );
    if ((i / CONCURRENCY) % 20 === 0) console.log(`  ...${i + batch.length}/${toScore.length}`);
  }
  console.log(`Sentiment backfill done. ${scored} scored, ${failed} failed/unscoreable.`);
}

async function recomputeAllTasteVectors() {
  // Union of every user who has ANY signal that could feed a taste
  // vector -- ratings, Pyramid favorites, or reviews -- not just users
  // currently missing a vector row. A stale/partial vector is just as
  // broken as a missing one for this repair's purposes.
  const [{ data: ratingUsers }, { data: favoriteUsers }, { data: reviewUsers }] = await Promise.all([
    supabase.from("ratings").select("user_id"),
    supabase.from("favorite_titles").select("user_id"),
    supabase.from("reviews").select("user_id"),
  ]);
  const userIds = new Set<string>([
    ...(ratingUsers ?? []).map((r) => r.user_id),
    ...(favoriteUsers ?? []).map((r) => r.user_id),
    ...(reviewUsers ?? []).map((r) => r.user_id),
  ]);
  console.log(`${userIds.size} users with any rating/favorite/review signal -- recomputing both media types for each.`);

  let ok = 0;
  let failed = 0;
  for (const userId of userIds) {
    const { error } = await supabase.rpc("recompute_taste_vector_for_user", { p_user_id: userId });
    if (error) {
      failed++;
      console.error(`  FAIL user=${userId}:`, error.message);
    } else {
      ok++;
    }
  }
  console.log(`Recompute done. ${ok} users recomputed, ${failed} failed.`);
}

async function main() {
  if (!SKIP_SENTIMENT) {
    await backfillReviewSentiment();
  } else {
    console.log("Skipping sentiment backfill (--skip-sentiment).");
  }
  await recomputeAllTasteVectors();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
