/**
 * One-time catalogue-wide re-embed.
 *
 * buildEmbeddingInput (src/lib/recommendations/embeddings.ts, and this
 * script's own copy in scripts/enrich-titles.ts) now folds director and
 * top-billed cast into the text handed to the embedding model -- previously
 * only genre/theme/tone/plot-adjacent metadata fed content-similarity
 * scoring, so a user's taste vector had no way to represent "loves anything
 * directed by X" or "loves anything starring Y" at all.
 *
 * That only changes what NEW embeddings look like going forward
 * (embedTitle/embedMissingTitles and enrich-titles.ts already pick it up
 * automatically). Every title embedded before this change still carries the
 * old, director/cast-blind vector until it's regenerated -- this script
 * does that once for the whole catalogue.
 *
 * Deliberately re-embeds EVERY title with an existing embedding, not just
 * "pending" ones (pending_enrichment_titles, migration 0018, only finds
 * titles missing an embedding entirely -- every title in the catalogue
 * already has one from before this change, so that RPC would find nothing
 * to do here).
 *
 * Safe to interrupt and resume: pass --start-offset=N (printed in the
 * progress log every page) to pick back up roughly where it left off.
 * Upserts are idempotent, so re-running over already-done titles just
 * redoes a small amount of harmless work rather than corrupting anything.
 *
 * Usage:
 *   npm run reembed:credits -- --concurrency=8 --start-offset=0
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

const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_CONCURRENCY = 8;
const PAGE_SIZE = 500;
const MAX_CAST_FOR_EMBEDDING = 5;

type Title = {
  id: string;
  name: string;
  overview: string | null;
  genres: string[] | null;
  themes: string[] | null;
  tone: string[] | null;
  pacing: string | null;
  mood_tags: string[] | null;
  ending_type: string | null;
  violence_level: number | null;
  comedy_level: number | null;
  emotional_intensity: number | null;
};

type EmbeddingCredits = { directors: string[]; topCast: string[] };

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
  );
  return {
    concurrency: Number(args.concurrency ?? DEFAULT_CONCURRENCY),
    startOffset: Number(args["start-offset"] ?? 0),
  };
}

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

function buildEmbeddingInput(title: Title, credits: EmbeddingCredits): string {
  const parts = [
    `Title: ${title.name}`,
    title.overview ? `Overview: ${title.overview}` : null,
    title.genres?.length ? `Genres: ${title.genres.join(", ")}` : null,
    title.themes?.length ? `Themes: ${title.themes.join(", ")}` : null,
    title.tone?.length ? `Tone: ${title.tone.join(", ")}` : null,
    title.pacing ? `Pacing: ${title.pacing}` : null,
    title.mood_tags?.length ? `Mood: ${title.mood_tags.join(", ")}` : null,
    title.ending_type ? `Ending: ${title.ending_type}` : null,
    typeof title.violence_level === "number" ? `Violence level (0-5): ${title.violence_level}` : null,
    typeof title.comedy_level === "number" ? `Comedy level (0-5): ${title.comedy_level}` : null,
    typeof title.emotional_intensity === "number"
      ? `Emotional intensity (0-5): ${title.emotional_intensity}`
      : null,
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

async function reembedOne(title: Title) {
  const credits = await fetchEmbeddingCredits(title.id);
  const input = buildEmbeddingInput(title, credits);
  const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input });
  const embedding = response.data[0].embedding;

  const { error } = await supabase
    .from("title_embeddings")
    .upsert({ title_id: title.id, embedding, model: EMBEDDING_MODEL });
  if (error) throw new Error(`upsert title_embeddings failed: ${error.message}`);
}

async function main() {
  const { concurrency, startOffset } = parseArgs();

  let offset = startOffset;
  let totalOk = 0;
  let totalFailed = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("titles")
      .select(
        "id, name, overview, genres, themes, tone, pacing, mood_tags, ending_type, violence_level, comedy_level, emotional_intensity"
      )
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`fetch titles page failed: ${error.message}`);

    const page = (data ?? []) as Title[];
    if (page.length === 0) break;

    let pageOk = 0;
    let pageFailed = 0;
    await runWithConcurrency(page, concurrency, async (title) => {
      try {
        await reembedOne(title);
        pageOk++;
      } catch (e) {
        pageFailed++;
        console.error(`  FAIL ${title.name} (${title.id}):`, e instanceof Error ? e.message : e);
      }
    });

    totalOk += pageOk;
    totalFailed += pageFailed;
    offset += page.length;
    console.log(
      `progress: offset=${offset} page_ok=${pageOk} page_failed=${pageFailed} total_ok=${totalOk} total_failed=${totalFailed}`
    );

    if (page.length < PAGE_SIZE) break;
  }

  console.log(`Done. ${totalOk} re-embedded, ${totalFailed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
