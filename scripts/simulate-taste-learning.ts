/**
 * Simulates whether the recommendation engine's taste vector actually
 * converges toward a user's real preferences as they rate more titles --
 * i.e. does "getting to know you" measurably work, and how fast.
 *
 * Why a simulation instead of real accounts: real production usage
 * (recommendation_impressions joined to ratings, see the Aug 14/15
 * accuracy analysis) currently has only 4 users who've ever been served a
 * recommendation, 2 of whom account for nearly all signal -- nowhere near
 * enough to prove or disprove a learning curve. Creating fake accounts to
 * generate more of that signal was considered and rejected: bot ratings
 * would land in the same `ratings`/`recommendation_impressions` tables
 * used for real-user accuracy analysis, permanently polluting the one
 * signal this app has for "does this work for real people."
 *
 * Instead this ports the EXACT scoring math the app actually runs --
 * recompute_taste_vector_for_user_for_type's weighting formula (migration
 * 0075) and match_titles_for_user's cosine-similarity ranking (migration
 * 0076) -- and runs it against two synthetic personas built from the
 * real catalogue's own taste-metadata columns (pacing/comedy_level/
 * emotional_intensity), with a known ground truth (what SHOULD this
 * persona like). That's a more rigorous test than real fake accounts
 * would be: ground truth is defined, not guessed.
 *
 * Read-only. Never writes to ratings, recommendation_impressions,
 * taste_vectors, or any other table -- only SELECTs titles and
 * title_embeddings. Safe to re-run any time as a standing regression
 * check on the recommendation engine's core learning behavior.
 *
 * Usage:
 *   npm run simulate:taste-learning
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Must match recompute_taste_vector_for_user_for_type (migration 0075):
// weight = (score - 2.5)^2 * 0.5^(days_elapsed / 730), i.e. a 2-year
// half-life. Simulated ratings are always "loved" (>=3.5), which is the
// same branch real power users are on (see has_loved in the SQL) -- once
// a user has any loved rating, only loved ratings feed the vector, so
// this is the actually-live code path, not a simplification of it.
const RECENCY_HALF_LIFE_DAYS = 730;
// Spread simulated ratings across this many days of (simulated) history,
// oldest-rated title first -- gives recency decay something real to do,
// rather than every rating landing at the same instant.
const SIMULATION_DAYS_SPAN = 400;
const CHECKPOINTS = [3, 5, 10, 20, 40, 60];
const TOP_N = 20;

// Deterministic PRNG (mulberry32) so this "verify"-style script gives the
// same answer on every run, same convention as the rest of this codebase's
// verify:*.ts scripts.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260815);

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Title = { id: string; name: string; embedding: number[] };
type TitleRow = { id: string; name: string };
type EmbeddingRow = { title_id: string; embedding: unknown };

function parseEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") return JSON.parse(raw) as number[];
  throw new Error(`Unexpected embedding shape: ${typeof raw}`);
}

type TitleQuery = ReturnType<ReturnType<typeof supabase.from>["select"]>;

async function fetchTitlesMatching(
  applyFilter: (q: TitleQuery) => TitleQuery,
  limit: number
): Promise<Title[]> {
  const base = supabase
    .from("titles")
    .select("id, name")
    .eq("type", "movie")
    .order("popularity", { ascending: false })
    .limit(limit) as unknown as TitleQuery;
  const { data: titles, error } = await applyFilter(base);
  if (error) throw new Error(error.message);
  const rows = (titles ?? []) as TitleRow[];
  const ids = rows.map((t) => t.id);
  if (ids.length === 0) return [];
  // .in() with hundreds of UUIDs blows past PostgREST's ~16KB header
  // limit on a GET request (HeadersOverflowError) -- chunk it.
  const CHUNK = 150;
  const embByTitle = new Map<string, number[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data: embeddings, error: embErr } = await supabase
      .from("title_embeddings")
      .select("title_id, embedding")
      .in("title_id", chunk);
    if (embErr) throw new Error(embErr.message);
    for (const e of (embeddings ?? []) as EmbeddingRow[]) {
      embByTitle.set(e.title_id, parseEmbedding(e.embedding));
    }
  }
  return rows
    .filter((t) => embByTitle.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, embedding: embByTitle.get(t.id)! }));
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Ports recompute_taste_vector_for_user_for_type's "loved" branch exactly
// (migration 0075) -- every simulated rating is >=3.5, so has_loved is
// always true and only this branch ever fires, same as it would in prod.
function computeTasteVector(ratings: { title: Title; score: number; ratedAt: Date }[], now: Date): number[] {
  const dim = ratings[0].title.embedding.length;
  const vec = new Array(dim).fill(0);
  let totalWeight = 0;
  for (const r of ratings) {
    const daysElapsed = (now.getTime() - r.ratedAt.getTime()) / 86400000;
    const decay = Math.pow(0.5, daysElapsed / RECENCY_HALF_LIFE_DAYS);
    const weight = Math.pow(r.score - 2.5, 2) * decay;
    for (let i = 0; i < dim; i++) vec[i] += r.title.embedding[i] * weight;
    totalWeight += weight;
  }
  return vec.map((v) => v / totalWeight);
}

interface PersonaResult {
  n: number;
  precisionAt20: number;
  negativesInTop20: number;
  meanSimPositive: number;
  meanSimNegative: number;
  meanSimDistractor: number;
  randomBaselinePrecision: number;
}

async function runPersonaSimulation(
  label: string,
  positivePool: Title[],
  negativePool: Title[],
  distractorPool: Title[]
): Promise<PersonaResult[]> {
  const shuffledPositive = shuffle(positivePool);
  const trainSize = Math.min(60, Math.floor(shuffledPositive.length * 0.6));
  const trainPool = shuffledPositive.slice(0, trainSize);
  const heldoutPositive = shuffledPositive.slice(trainSize);
  const trainIds = new Set(trainPool.map((t) => t.id));
  const candidatePool = [...heldoutPositive, ...negativePool, ...distractorPool].filter((t) => !trainIds.has(t.id));
  const heldoutPositiveIds = new Set(heldoutPositive.map((t) => t.id));
  const negativeIds = new Set(negativePool.map((t) => t.id));

  const now = new Date();
  const results: PersonaResult[] = [];

  for (const n of CHECKPOINTS) {
    if (n > trainPool.length) break;
    const ratings = trainPool.slice(0, n).map((title, i) => ({
      title,
      score: 4.0 + rng() * 1.0, // loved: 4.0-5.0
      // Oldest-first: rating i=0 is furthest in the past.
      ratedAt: new Date(now.getTime() - (SIMULATION_DAYS_SPAN * (1 - i / n)) * 86400000),
    }));
    const tasteVector = computeTasteVector(ratings, now);

    const scored = candidatePool
      .map((t) => ({ t, sim: cosineSimilarity(tasteVector, t.embedding) }))
      .sort((a, b) => b.sim - a.sim);
    const top20 = scored.slice(0, TOP_N);

    const hits = top20.filter((s) => heldoutPositiveIds.has(s.t.id)).length;
    const negHits = top20.filter((s) => negativeIds.has(s.t.id)).length;
    const posSims = scored.filter((s) => heldoutPositiveIds.has(s.t.id)).map((s) => s.sim);
    const negSims = scored.filter((s) => negativeIds.has(s.t.id)).map((s) => s.sim);
    const distSims = scored.filter((s) => !heldoutPositiveIds.has(s.t.id) && !negativeIds.has(s.t.id)).map((s) => s.sim);
    const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);

    results.push({
      n,
      precisionAt20: hits / TOP_N,
      negativesInTop20: negHits,
      meanSimPositive: mean(posSims),
      meanSimNegative: mean(negSims),
      meanSimDistractor: mean(distSims),
      randomBaselinePrecision: heldoutPositive.length / candidatePool.length,
    });
  }

  console.log(`\n=== ${label} (train pool ${trainPool.length}, held-out positive ${heldoutPositive.length}, negative ${negativePool.length}, distractors ${distractorPool.length}) ===`);
  console.log("ratings | precision@20 | vs random baseline | negatives-in-top20 | mean-sim(+) | mean-sim(-) | mean-sim(distractor)");
  for (const r of results) {
    console.log(
      `${String(r.n).padStart(7)} | ${(r.precisionAt20 * 100).toFixed(1).padStart(11)}% | ${(r.randomBaselinePrecision * 100).toFixed(2).padStart(17)}% | ${String(r.negativesInTop20).padStart(19)} | ${r.meanSimPositive.toFixed(4)} | ${r.meanSimNegative.toFixed(4)} | ${r.meanSimDistractor.toFixed(4)}`
    );
  }
  return results;
}

async function main() {
  console.log("Fetching persona pools from the real catalogue (read-only)...");

  // Persona A: "Dark Prestige" -- slow, emotionally heavy, not comedic.
  const darkPrestige = await fetchTitlesMatching(
    (q) => q.eq("pacing", "slow").gte("emotional_intensity", 4).lte("comedy_level", 1),
    500
  );
  // Persona B: "Broad Comedy" -- persona A's natural opposite, and used as
  // persona A's negative/false-positive pool and vice versa.
  const broadComedy = await fetchTitlesMatching((q) => q.gte("comedy_level", 4), 500);

  const excludeIds = new Set([...darkPrestige, ...broadComedy].map((t) => t.id));
  const distractorsRaw = await fetchTitlesMatching((q) => q, 1500);
  const distractors = distractorsRaw.filter((t) => !excludeIds.has(t.id));

  console.log(`Dark Prestige pool: ${darkPrestige.length}, Broad Comedy pool: ${broadComedy.length}, distractors: ${distractors.length}`);

  await runPersonaSimulation("Persona A: Dark Prestige fan", darkPrestige, broadComedy, distractors);
  await runPersonaSimulation("Persona B: Broad Comedy fan", broadComedy, darkPrestige, distractors);

  console.log("\nDone. Precision@20 climbing toward its ceiling (and staying well above the random baseline) as ratings increase means the taste vector is genuinely converging on the persona, not just memorizing what it was told.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
