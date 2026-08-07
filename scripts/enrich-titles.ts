/**
 * Backfill script — finds titles that were ingested without AI taste
 * metadata and/or an embedding (see scripts/ingest-tmdb.ts, which inserts
 * titles even when OpenAI billing isn't active yet) and fills them in.
 *
 * Run this once your OpenAI account has billing enabled. Safe to re-run —
 * it only touches titles missing an embedding, so it picks up wherever it
 * left off if interrupted.
 *
 * Usage:
 *   npm run enrich:titles -- --limit=50
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const CHAT_MODEL = "gpt-4.1-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_CONCURRENCY = 8;

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
  );
  return {
    limit: Number(args.limit ?? 25),
    concurrency: Number(args.concurrency ?? DEFAULT_CONCURRENCY),
  };
}

type Title = {
  id: string;
  name: string;
  overview: string | null;
  genres: string[];
};

type TasteMetadata = {
  themes: string[];
  tone: string[];
  pacing: string;
  violence_level: number;
  comedy_level: number;
  emotional_intensity: number;
  dialogue_density: number;
  ending_type: string;
  mood_tags: string[];
  color_palette: string[];
};

async function inferTasteMetadata(name: string, overview: string, genres: string[]): Promise<TasteMetadata> {
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You tag films with structured taste metadata for a recommendation engine. " +
          "Respond only with strict JSON matching the requested shape. Be specific, not generic.",
      },
      {
        role: "user",
        content: `Film: "${name}"\nGenres: ${genres.join(", ")}\nOverview: ${overview}\n\nReturn JSON: {
  "themes": string[] (2-4 short theme phrases),
  "tone": string[] (1-3 words, e.g. "dark", "hopeful", "satirical"),
  "pacing": "slow" | "moderate" | "fast",
  "violence_level": integer 0-5,
  "comedy_level": integer 0-5,
  "emotional_intensity": integer 0-5,
  "dialogue_density": integer 0-5,
  "ending_type": one of "happy" | "ambiguous" | "tragic" | "twist" | "bittersweet" | "open",
  "mood_tags": string[] (2-4 mood words a person would search by),
  "color_palette": string[] (1-2 color/lighting descriptors, e.g. "desaturated", "neon")
}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(completion.choices[0].message.content ?? "{}");
}

type EmbeddingCredits = { directors: string[]; topCast: string[] };

/** Same cap as src/lib/recommendations/embeddings.ts -- keep these two
 *  buildEmbeddingInput implementations (this script's copy exists because
 *  scripts avoid importing "server-only"-guarded app code) producing
 *  byte-identical input shapes for the same title, or content-similarity
 *  scoring would silently drift depending on which path embedded a title. */
const MAX_CAST_FOR_EMBEDDING = 5;

async function fetchEmbeddingCredits(titleId: string): Promise<EmbeddingCredits> {
  const { data } = await supabase
    .from("title_credits")
    .select("credit_type, billing_order, people(name)")
    .eq("title_id", titleId)
    .in("credit_type", ["director", "actor"]);

  const rows = (data ?? []) as unknown as {
    credit_type: string;
    billing_order: number | null;
    people: { name: string } | null;
  }[];

  const directors = rows
    .filter((r) => r.credit_type === "director")
    .map((r) => r.people?.name)
    .filter((n): n is string => !!n);

  const topCast = rows
    .filter((r) => r.credit_type === "actor")
    .sort((a, b) => (a.billing_order ?? 999) - (b.billing_order ?? 999))
    .slice(0, MAX_CAST_FOR_EMBEDDING)
    .map((r) => r.people?.name)
    .filter((n): n is string => !!n);

  return { directors, topCast };
}

function buildEmbeddingInput(title: Title, taste: TasteMetadata, credits: EmbeddingCredits): string {
  const parts = [
    `Title: ${title.name}`,
    title.overview ? `Overview: ${title.overview}` : null,
    title.genres?.length ? `Genres: ${title.genres.join(", ")}` : null,
    taste.themes?.length ? `Themes: ${taste.themes.join(", ")}` : null,
    taste.tone?.length ? `Tone: ${taste.tone.join(", ")}` : null,
    taste.pacing ? `Pacing: ${taste.pacing}` : null,
    taste.mood_tags?.length ? `Mood: ${taste.mood_tags.join(", ")}` : null,
    taste.ending_type ? `Ending: ${taste.ending_type}` : null,
    `Violence level (0-5): ${taste.violence_level}`,
    `Comedy level (0-5): ${taste.comedy_level}`,
    `Emotional intensity (0-5): ${taste.emotional_intensity}`,
    credits.directors.length ? `Director: ${credits.directors.join(", ")}` : null,
    credits.topCast.length ? `Starring: ${credits.topCast.join(", ")}` : null,
  ];
  return parts.filter(Boolean).join("\n");
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

async function enrichOne(title: Title) {
  const taste = await inferTasteMetadata(title.name, title.overview ?? "", title.genres ?? []);

  const { error: updateError } = await supabase
    .from("titles")
    .update({
      themes: taste.themes ?? [],
      tone: taste.tone ?? [],
      pacing: taste.pacing ?? null,
      violence_level: taste.violence_level ?? null,
      comedy_level: taste.comedy_level ?? null,
      emotional_intensity: taste.emotional_intensity ?? null,
      dialogue_density: taste.dialogue_density ?? null,
      ending_type: taste.ending_type ?? null,
      color_palette: taste.color_palette ?? [],
      mood_tags: taste.mood_tags ?? [],
    })
    .eq("id", title.id);
  if (updateError) throw new Error(`update titles failed: ${updateError.message}`);

  const credits = await fetchEmbeddingCredits(title.id);
  const input = buildEmbeddingInput(title, taste, credits);
  const embeddingResponse = await openai.embeddings.create({ model: EMBEDDING_MODEL, input });
  const embedding = embeddingResponse.data[0].embedding;

  const { error: embedError } = await supabase
    .from("title_embeddings")
    .upsert({ title_id: title.id, embedding, model: EMBEDDING_MODEL });
  if (embedError) throw new Error(`upsert title_embeddings failed: ${embedError.message}`);

  console.log(`  ok  ${title.name}`);
}

async function main() {
  const { limit, concurrency } = parseArgs();

  // Which titles still need AI enrichment is now computed by a single
  // indexed anti-join in Postgres (migration 0018) instead of pulling the
  // entire titles + title_embeddings tables into JS and diffing them
  // client-side. That client-side approach required ~40 paginated round
  // trips on every single invocation once the catalogue hit ~36.5k rows —
  // most of a 45s run was spent computing the pending list, not enriching.
  // Ordered by TMDB popularity server-side, so the highest-impact titles
  // (the ones users will actually search for or get recommended) land first.
  const { data, error } = await supabase.rpc("pending_enrichment_titles", { p_limit: limit });
  if (error) throw new Error(`pending_enrichment_titles failed: ${error.message}`);
  const pending = (data ?? []) as Title[];

  console.log(`${pending.length} titles fetched for enrichment (limit ${limit}, concurrency ${concurrency}).`);
  if (pending.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let ok = 0;
  let failed = 0;
  await runWithConcurrency(pending, concurrency, async (title) => {
    try {
      await enrichOne(title);
      ok++;
    } catch (e) {
      failed++;
      console.error(`  FAIL ${title.name}:`, e instanceof Error ? e.message : e);
    }
  });

  console.log(`Done. ${ok} enriched, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
