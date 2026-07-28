/**
 * One-time backfill: every existing rating was written by rateTitle() calling
 * upsert_taste_vector_from_rating() (migration 0003), but that function is a
 * no-op whenever the rated title has no embedding yet — and until the
 * enrich-titles.ts backfill just ran, *no* title had an embedding. So every
 * historical rating silently failed to build a taste vector, and every user
 * who has already rated things is still stuck seeing cold-start/popularity
 * recommendations.
 *
 * This replays every existing rating, oldest first per user, through the
 * exact same RPC a live rating uses — so the resulting taste_vectors rows are
 * identical to what would exist if those ratings had happened after
 * enrichment instead of before it. Safe to re-run: upsert_taste_vector_from_rating
 * only accumulates safely if run once per rating, so re-running this script
 * would double-count — it's meant to be run exactly once, right after a fresh
 * embeddings backfill.
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
  const { data: existing } = await supabase.from("taste_vectors").select("user_id");
  const alreadyBuilt = new Set((existing ?? []).map((r) => r.user_id));

  const { data: ratings, error } = await supabase
    .from("ratings")
    .select("user_id, title_id, score, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const toReplay = (ratings ?? []).filter((r) => !alreadyBuilt.has(r.user_id));
  console.log(`${toReplay.length} historical ratings to replay (${(ratings ?? []).length} total, ${alreadyBuilt.size} users already have a taste vector).`);

  let ok = 0;
  let failed = 0;
  for (const r of toReplay) {
    const { error: rpcError } = await supabase.rpc("upsert_taste_vector_from_rating", {
      p_user_id: r.user_id,
      p_title_id: r.title_id,
      p_score: r.score,
    });
    if (rpcError) {
      failed++;
      console.error(`  FAIL user=${r.user_id} title=${r.title_id}:`, rpcError.message);
    } else {
      ok++;
    }
  }

  console.log(`Done. ${ok} ratings replayed, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
