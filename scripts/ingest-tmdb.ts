/**
 * TMDB ingestion script — populates public.titles, public.people,
 * public.title_credits, and public.title_embeddings from TMDB.
 *
 * This is intentionally a standalone script (not importing from src/lib)
 * because src/lib/supabase/server.ts and src/lib/ai/openai.ts assume a
 * Next.js request context (next/headers, etc.) that doesn't exist here.
 * buildEmbeddingInput below mirrors src/lib/recommendations/embeddings.ts —
 * keep them in sync if the taste-metadata schema changes.
 *
 * Usage:
 *   npm run ingest:tmdb -- --page=1 --list=popular
 *   npm run ingest:tmdb -- --pages=1-10 --list=popular,top_rated,now_playing,upcoming
 *   npm run ingest:tmdb -- --pages=1-5 --list=popular --no-ai   (skip taste/embedding
 *     calls entirely for max throughput during a bulk catalogue build; run
 *     enrich:titles later once OpenAI billing is active)
 *
 * Requires TMDB_API_KEY, OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY — loaded via `node --env-file=.env.local`
 * (wired into the npm script already). OPENAI_API_KEY still needs to be set
 * even with --no-ai (just unused) since the OpenAI client is constructed
 * unconditionally below.
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TMDB_API_KEY || !OPENAI_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing TMDB_API_KEY, OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const CHAT_MODEL = "gpt-4.1-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_CONCURRENCY_AI = 8;
const DEFAULT_CONCURRENCY_NO_AI = 20; // no OpenAI calls to rate-limit against, just TMDB + Supabase

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
  );

  const pagesArg = args.pages ?? args.page ?? "1";
  let pageStart: number;
  let pageEnd: number;
  if (pagesArg.includes("-")) {
    const [start, end] = pagesArg.split("-").map(Number);
    pageStart = start;
    pageEnd = end;
  } else {
    pageStart = pageEnd = Number(pagesArg);
  }

  const lists = (args.list ?? "popular").split(",") as (
    | "popular"
    | "top_rated"
    | "now_playing"
    | "upcoming"
    | "discover"
  )[];

  const noAi = args["no-ai"] === "true";
  const concurrency = args.concurrency
    ? Number(args.concurrency)
    : noAi
      ? DEFAULT_CONCURRENCY_NO_AI
      : DEFAULT_CONCURRENCY_AI;

  return {
    pageStart,
    pageEnd,
    lists,
    noAi,
    concurrency,
    // Only meaningful for --list=discover — a bulk-catalogue query filtered
    // by minimum vote count and a release-date band. TMDB caps any single
    // discover query at 500 pages (10,000 results) regardless of how many
    // total_results it reports, so a large target range has to be split
    // into several date bands run as separate invocations of this script.
    voteCountGte: args["vote-count-gte"] ?? "0",
    dateGte: args["date-gte"] ?? "",
    dateLte: args["date-lte"] ?? "",
  };
}

async function tmdbFetch(path: string, params: Record<string, string> = {}) {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set("api_key", TMDB_API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

type TmdbMovieSummary = { id: number };

type TasteMetadata = {
  themes: string[];
  tone: string[];
  pacing: "slow" | "moderate" | "fast";
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

/** Mirrors src/lib/recommendations/embeddings.ts#buildEmbeddingInput */
function buildEmbeddingInput(title: {
  name: string;
  overview: string | null;
  genres: string[];
  themes: string[];
  tone: string[];
  pacing: string | null;
  mood_tags: string[];
  ending_type: string | null;
  violence_level: number | null;
  comedy_level: number | null;
  emotional_intensity: number | null;
}): string {
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
  ];
  return parts.filter(Boolean).join("\n");
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

const emptyTaste: TasteMetadata = {
  themes: [],
  tone: [],
  pacing: "moderate",
  violence_level: 0,
  comedy_level: 0,
  emotional_intensity: 0,
  dialogue_density: 0,
  ending_type: "",
  mood_tags: [],
  color_palette: [],
};

type IngestResult = { taste: "ok" | "skipped"; embedding: "ok" | "skipped" };

async function ingestOne(summary: TmdbMovieSummary, noAi: boolean): Promise<IngestResult> {
  const details = await tmdbFetch(`/movie/${summary.id}`, { append_to_response: "credits" });
  const genres: string[] = (details.genres ?? []).map((g: { name: string }) => g.name);

  // Taste-metadata inference needs a billed OpenAI account. If it's not
  // available yet (or --no-ai was passed for a fast bulk-catalogue run),
  // insert the title with TMDB's own fields and leave taste fields empty
  // rather than failing the whole ingest — enrich-titles.ts backfills these
  // later once billing is active.
  let taste = emptyTaste;
  let tasteStatus: IngestResult["taste"] = "skipped";
  if (!noAi) {
    try {
      taste = await inferTasteMetadata(details.title, details.overview ?? "", genres);
      tasteStatus = "ok";
    } catch (e) {
      console.warn(`  (taste metadata skipped for ${details.title}: ${e instanceof Error ? e.message : e})`);
    }
  }

  const titleRow = {
    tmdb_id: details.id,
    type: "movie" as const,
    name: details.title,
    original_name: details.original_title,
    overview: details.overview,
    release_date: details.release_date || null,
    runtime_minutes: details.runtime || null,
    poster_url: details.poster_path ? `${IMAGE_BASE}/w780${details.poster_path}` : null,
    backdrop_url: details.backdrop_path ? `${IMAGE_BASE}/w1280${details.backdrop_path}` : null,
    original_language: details.original_language,
    genres,
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
    tmdb_rating: details.vote_average ?? null,
    tmdb_vote_count: details.vote_count ?? null,
    popularity: details.popularity ?? null,
  };

  const { data: title, error } = await supabase
    .from("titles")
    .upsert(titleRow, { onConflict: "tmdb_id" })
    .select("id")
    .single();
  if (error || !title) throw new Error(`upsert titles failed for ${details.title}: ${error?.message}`);

  // Credits: director + top 5 billed cast
  const crew = details.credits?.crew ?? [];
  const cast = (details.credits?.cast ?? []).slice(0, 5);
  const director = crew.find((c: { job: string }) => c.job === "Director");
  const creditPeople = [
    ...(director ? [{ ...director, credit_type: "director" as const, billing_order: null }] : []),
    ...cast.map((c: { order: number }, i: number) => ({ ...c, credit_type: "actor" as const, billing_order: i })),
  ];

  for (const person of creditPeople) {
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
        credit_type: person.credit_type,
        character_name: person.character ?? null,
        billing_order: person.billing_order,
      },
      { onConflict: "title_id,person_id,credit_type" }
    );
  }

  // Embedding — same story: skip gracefully if OpenAI isn't billed yet.
  let embeddingStatus: IngestResult["embedding"] = "skipped";
  if (!noAi) {
    try {
      const input = buildEmbeddingInput(titleRow);
      const embeddingResponse = await openai.embeddings.create({ model: EMBEDDING_MODEL, input });
      const embedding = embeddingResponse.data[0].embedding;
      await supabase.from("title_embeddings").upsert({ title_id: title.id, embedding, model: EMBEDDING_MODEL });
      embeddingStatus = "ok";
    } catch (e) {
      console.warn(`  (embedding skipped for ${details.title}: ${e instanceof Error ? e.message : e})`);
    }
  }

  const flags = [tasteStatus === "skipped" ? "no-taste" : null, embeddingStatus === "skipped" ? "no-embedding" : null]
    .filter(Boolean)
    .join(", ");
  console.log(`  ok  ${details.title} (${details.release_date?.slice(0, 4) ?? "?"})${flags ? ` [${flags}]` : ""}`);

  return { taste: tasteStatus, embedding: embeddingStatus };
}

async function main() {
  const { pageStart, pageEnd, lists, noAi, concurrency, voteCountGte, dateGte, dateLte } = parseArgs();

  let ok = 0;
  let failed = 0;
  let enriched = 0;
  let totalSeen = 0;

  for (const list of lists) {
    for (let page = pageStart; page <= pageEnd; page++) {
      const isDiscover = list === "discover";
      console.log(
        isDiscover
          ? `Fetching TMDB discover page ${page} (vote_count>=${voteCountGte}, ${dateGte || "any"}..${dateLte || "any"})...`
          : `Fetching TMDB "${list}" page ${page}...`
      );
      let listResponse: { results?: TmdbMovieSummary[] };
      try {
        listResponse = isDiscover
          ? await tmdbFetch(`/discover/movie`, {
              page: String(page),
              sort_by: "popularity.desc",
              "vote_count.gte": voteCountGte,
              ...(dateGte ? { "primary_release_date.gte": dateGte } : {}),
              ...(dateLte ? { "primary_release_date.lte": dateLte } : {}),
            })
          : await tmdbFetch(`/movie/${list}`, { page: String(page) });
      } catch (e) {
        console.error(`  FAIL fetching ${list} page ${page}:`, e instanceof Error ? e.message : e);
        continue;
      }
      const summaries: TmdbMovieSummary[] = listResponse.results ?? [];
      if (!summaries.length) {
        console.log(`  (no results — list may be exhausted)`);
        continue;
      }
      totalSeen += summaries.length;

      await runWithConcurrency(summaries, concurrency, async (summary) => {
        try {
          const result = await ingestOne(summary, noAi);
          ok++;
          if (result.taste === "ok" && result.embedding === "ok") enriched++;
        } catch (e) {
          failed++;
          console.error(`  FAIL id=${summary.id}:`, e instanceof Error ? e.message : e);
        }
      });
    }
  }

  console.log(
    `\nDone. Saw ${totalSeen} listings across ${lists.join(", ")} pages ${pageStart}-${pageEnd}; ` +
      `${ok} upserted (dedup'd by tmdb_id), ${failed} failed, ${enriched}/${ok} fully AI-enriched.`
  );
  if (ok > enriched) {
    console.log(`Run "npm run enrich:titles" once OpenAI billing is active to backfill the rest.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
