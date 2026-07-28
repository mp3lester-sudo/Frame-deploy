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
const CONCURRENCY = 8;

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
  );
  return { limit: Number(args.limit ?? 25) };
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

function buildEmbeddingInput(title: Title, taste: TasteMetadata): string {
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

  const input = buildEmbeddingInput(title, taste);
  const embeddingResponse = await openai.embeddings.create({ model: EMBEDDING_MODEL, input });
  const embedding = embeddingResponse.data[0].embedding;

  const { error: embedError } = await supabase
    .from("title_embeddings")
    .upsert({ title_id: title.id, embedding, model: EMBEDDING_MODEL });
  if (embedError) throw new Error(`upsert title_embeddings failed: ${embedError.message}`);

  console.log(`  ok  ${title.name}`);
}

async function main() {
  const { limit } = parseArgs();

  // Titles with no row in title_embeddings yet — the one reliable signal
  // that a title still needs AI enrichment, regardless of what placeholder
  // values ingest-tmdb.ts left in the taste columns.
  //
  // Both queries below paginate with .range() rather than a bare .select(),
  // because PostgREST silently caps unpaginated selects at 1000 rows. Once
  // title_embeddings passed 1000 rows, a bare select here only saw an
  // arbitrary 1000-row slice of "done" ids, so already-embedded titles kept
  // getting treated as pending and reprocessed for no gain — the fetch of
  // allTitles below had the identical bug and was fixed first, which is what
  // exposed this one.
  const PAGE_SIZE = 1000;
  const embeddedIds = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from("title_embeddings").select("title_id").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) embeddedIds.add(row.title_id);
    if (data.length < PAGE_SIZE) break;
  }

  const allTitles: Title[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("titles")
      .select("id, name, overview, genres")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    allTitles.push(...(data as Title[]));
    if (data.length < PAGE_SIZE) break;
  }

  const pending = allTitles.filter((t) => !embeddedIds.has(t.id)).slice(0, limit);

  console.log(`${pending.length} titles need enrichment (of ${allTitles.length} total, limit ${limit}).`);
  if (pending.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let ok = 0;
  let failed = 0;
  await runWithConcurrency(pending, CONCURRENCY, async (title) => {
    try {
      await enrichOne(title as Title);
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
