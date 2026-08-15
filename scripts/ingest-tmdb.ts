/**
 * TMDB ingestion script — populates public.titles, public.people,
 * public.title_credits, and public.title_embeddings from TMDB. Handles
 * both movies and TV shows (--type=movie, the default, or --type=tv).
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
 *   npm run ingest:tmdb -- --type=tv --pages=1-10 --list=popular,top_rated,on_the_air
 *     (TV shows -- list names are TV-specific, see parseArgs; movie-only
 *     lists like "now_playing"/"upcoming" don't exist for TV)
 *   npm run ingest:tmdb -- --type=tv --list=discover --pages=1-50 --vote-count-gte=50
 *
 * TV notes (see ingestOne):
 *   - TMDB's movie-id and tv-id numbering are independent counters that
 *     collide (movie id 1396 is "Sneakers", tv id 1396 is "Breaking
 *     Bad") -- titles.tmdb_id is unique on (tmdb_id, type) as of
 *     migration 0070, not tmdb_id alone, and this script's upsert
 *     conflicts on "tmdb_id,type" to match.
 *   - TV genre names (e.g. "Sci-Fi & Fantasy", "Action & Adventure")
 *     don't match the movie genre vocabulary Discover/onboarding filter
 *     on -- TV_GENRE_EXPANSIONS below remaps them onto the closest movie
 *     genre string(s) at ingestion time so genre filters behave the same
 *     in both Movies and Shows mode.
 *   - TV shows get a 'creator' credit (TMDB's created_by / showrunner
 *     field), never 'director' -- a showrunner isn't the same thing a
 *     "Director" credit means everywhere else in this app (Director of
 *     the Day, same-director diversify exclusion, the embedding input's
 *     "Director: ..." line), so the two credit types are kept fully
 *     separate (migration 0073) rather than mislabeling one as the
 *     other. Creator Spotlight reads 'creator' exclusively.
 *   - TV rows also carry number_of_seasons/number_of_episodes/
 *     in_production/tv_status/next_episode_air_date (migration 0073) --
 *     TMDB's /tv/{id} response has always included these, they just
 *     weren't persisted until this pass.
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

  const mediaType = (args.type === "tv" ? "tv" : "movie") as "movie" | "tv";

  // Movie-list names ("now_playing", "upcoming") don't exist for TV;
  // TV's own list names ("on_the_air", "airing_today") don't exist for
  // movies. Not validated against mediaType here -- an invalid
  // combination just 404s per-page against TMDB, logs "FAIL fetching",
  // and moves on, same as any other bad list name would.
  const lists = (args.list ?? "popular").split(",") as (
    | "popular"
    | "top_rated"
    | "now_playing"
    | "upcoming"
    | "on_the_air"
    | "airing_today"
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
    mediaType,
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

type TmdbSummary = { id: number };

// TMDB's TV genre vocabulary doesn't match its movie genre vocabulary --
// several TV genres are merges of two movie genres ("Sci-Fi & Fantasy",
// "Action & Adventure"), and Discover/onboarding/the landing teaser all
// filter on the movie vocabulary (see ANCHOR_GENRES in
// src/lib/catalogue/diverse-deck.ts and the GENRES list in
// src/app/discover/page.tsx). Expanding a merged TV genre into both of
// its movie-genre equivalents at ingestion time means those filters
// behave the same in Shows mode as they already do in Movies mode,
// without every genre-filtered query needing its own TV-aware branch.
// TV genres with no reasonable movie equivalent (News, Reality, Soap,
// Talk) are left as-is -- they just won't match any anchor-genre filter,
// which is correct (nothing in ANCHOR_GENRES claims to cover them).
const TV_GENRE_EXPANSIONS: Record<string, string[]> = {
  "Action & Adventure": ["Action", "Adventure"],
  "Sci-Fi & Fantasy": ["Science Fiction", "Fantasy"],
  "War & Politics": ["War"],
  Kids: ["Family"],
};

function expandTvGenres(rawGenres: string[]): string[] {
  const expanded = new Set<string>();
  for (const g of rawGenres) {
    for (const mapped of TV_GENRE_EXPANSIONS[g] ?? [g]) expanded.add(mapped);
  }
  return [...expanded];
}

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

type IngestResult = { taste: "ok" | "skipped" | "already"; embedding: "ok" | "skipped" | "already" };

async function ingestOne(summary: TmdbSummary, noAi: boolean, mediaType: "movie" | "tv"): Promise<IngestResult> {
  const isTv = mediaType === "tv";
  const details = await tmdbFetch(isTv ? `/tv/${summary.id}` : `/movie/${summary.id}`, {
    append_to_response: "credits",
  });
  const rawGenres: string[] = (details.genres ?? []).map((g: { name: string }) => g.name);
  const genres = isTv ? expandTvGenres(rawGenres) : rawGenres;

  // TMDB shapes these fields differently between /movie and /tv --
  // "title"/"name", "release_date"/"first_air_date", a single "runtime"
  // vs. an "episode_run_time" array (per-episode length; take the first
  // reported value -- most shows only ever report one).
  const name: string = isTv ? details.name : details.title;
  const originalName: string | null = isTv ? details.original_name : details.original_title;
  const releaseDate: string | null = isTv ? details.first_air_date : details.release_date;
  const runtimeMinutes: number | null = isTv
    ? (Array.isArray(details.episode_run_time) && details.episode_run_time.length
        ? details.episode_run_time[0]
        : null)
    : details.runtime || null;

  // A broad --list=discover sweep at catalogue-expansion scale re-surfaces
  // plenty of titles already ingested in earlier runs -- discover sorts by
  // popularity, so the same well-known titles resurface near the top of
  // every date band before a page range reaches genuinely new ones. Check
  // for an existing, already-enriched row up front so this doesn't spend
  // an OpenAI call re-deriving taste metadata/an embedding a title already
  // has -- the alternative (running inferTasteMetadata unconditionally on
  // every upsert) would burn real spend re-tagging the same popular
  // titles over and over across every date band in a large expansion run.
  let alreadyEnriched = false;
  if (!noAi) {
    const { data: existing } = await supabase
      .from("titles")
      .select("id")
      .eq("tmdb_id", details.id)
      .eq("type", mediaType)
      .maybeSingle();
    if (existing) {
      const { data: existingEmbedding } = await supabase
        .from("title_embeddings")
        .select("title_id")
        .eq("title_id", existing.id)
        .maybeSingle();
      alreadyEnriched = !!existingEmbedding;
    }
  }

  // Taste-metadata inference needs a billed OpenAI account. If it's not
  // available yet (or --no-ai was passed for a fast bulk-catalogue run),
  // insert the title with TMDB's own fields and leave taste fields empty
  // rather than failing the whole ingest — enrich-titles.ts backfills these
  // later once billing is active.
  let taste = emptyTaste;
  let tasteStatus: IngestResult["taste"] = alreadyEnriched ? "already" : "skipped";
  if (!noAi && !alreadyEnriched) {
    try {
      taste = await inferTasteMetadata(name, details.overview ?? "", genres);
      tasteStatus = "ok";
    } catch (e) {
      console.warn(`  (taste metadata skipped for ${name}: ${e instanceof Error ? e.message : e})`);
    }
  }

  const titleRow: Record<string, unknown> = {
    tmdb_id: details.id,
    type: mediaType,
    name,
    original_name: originalName,
    overview: details.overview,
    release_date: releaseDate || null,
    runtime_minutes: runtimeMinutes,
    poster_url: details.poster_path ? `${IMAGE_BASE}/w780${details.poster_path}` : null,
    backdrop_url: details.backdrop_path ? `${IMAGE_BASE}/w1280${details.backdrop_path}` : null,
    original_language: details.original_language,
    genres,
    tmdb_rating: details.vote_average ?? null,
    tmdb_vote_count: details.vote_count ?? null,
    popularity: details.popularity ?? null,
  };
  // TV-only metadata (migration 0073) -- the /tv/{id} response has always
  // included these fields, they were just never persisted. Left undefined
  // (omitted from the upsert) for movies rather than set to null, so a
  // movie row never even has these columns touched.
  if (isTv) {
    Object.assign(titleRow, {
      number_of_seasons: details.number_of_seasons ?? null,
      number_of_episodes: details.number_of_episodes ?? null,
      in_production: details.in_production ?? null,
      tv_status: details.status ?? null,
      next_episode_air_date: details.next_episode_to_air?.air_date ?? null,
    });
  }
  // Taste-metadata columns are only included in the upsert when this run
  // actually resolved fresh values (tasteStatus "ok") or genuinely has
  // none yet ("skipped", the existing --no-ai/no-billing path) -- an
  // "already" title omits them entirely so the ON CONFLICT update never
  // touches those columns, instead of overwriting the real taste data
  // already sitting there with emptyTaste's placeholders.
  if (!alreadyEnriched) {
    Object.assign(titleRow, {
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
    });
  }

  const { data: title, error } = await supabase
    .from("titles")
    // Conflict target is the (tmdb_id, type) pair (migration 0070), not
    // tmdb_id alone -- TMDB's movie-id and tv-id counters are
    // independent and do collide (e.g. movie id 1396 is "Sneakers", tv
    // id 1396 is "Breaking Bad"), so tmdb_id alone isn't a safe upsert
    // key once both types are being ingested into the same table.
    .upsert(titleRow, { onConflict: "tmdb_id,type" })
    .select("id")
    .single();
  if (error || !title) throw new Error(`upsert titles failed for ${name}: ${error?.message}`);

  // Credits: top 5 billed cast, plus a director credit for movies or a
  // creator (showrunner) credit for TV -- deliberately two different
  // credit_type values (migration 0073), never the same one. TMDB's
  // created_by is not what a "Director" credit means anywhere else in
  // this app (Director of the Day, diversify.ts's same-director
  // exclusion, the embedding input's "Director: ..." line); labeling a
  // showrunner as a director would quietly corrupt those movie-scoped
  // features. Creator Spotlight (the TV analog of Director of the Day)
  // reads credit_type = 'creator' exclusively.
  const crew = details.credits?.crew ?? [];
  const cast = (details.credits?.cast ?? []).slice(0, 5);
  const director = isTv ? undefined : crew.find((c: { job: string }) => c.job === "Director");
  const createdBy: { id: number; name: string; profile_path: string | null }[] = isTv
    ? (details.created_by ?? [])
    : [];
  const creditPeople = [
    ...(director ? [{ ...director, credit_type: "director" as const, billing_order: null }] : []),
    ...createdBy.map((c, i) => ({ ...c, credit_type: "creator" as const, billing_order: i })),
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
  //
  // Deliberately gated on tasteStatus === "ok", not just !noAi. Taste
  // inference and the embedding call used to be independent try/catches:
  // if AI was enabled but taste inference alone failed (a transient
  // OpenAI error, a timeout, whatever), the embedding call would still
  // run and succeed off of `emptyTaste`'s placeholder values
  // (pacing: "moderate", every level: 0) baked into buildEmbeddingInput.
  // Those placeholders are indistinguishable from genuine low-intensity
  // taste data once written, and pending_enrichment_titles (migration
  // 0018) only checks whether a title_embeddings row exists at all — so
  // that title would never be re-selected for real enrichment and would
  // sit permanently on fake data. Skipping the embedding too when taste
  // failed keeps the title "pending" so enrich-titles.ts (which does
  // taste + embedding as one atomic unit, see its inferTasteMetadata call
  // throwing before the embedding upsert) can backfill both correctly.
  let embeddingStatus: IngestResult["embedding"] = alreadyEnriched ? "already" : "skipped";
  if (!noAi && !alreadyEnriched && tasteStatus === "ok") {
    try {
      const input = buildEmbeddingInput(
        titleRow as Parameters<typeof buildEmbeddingInput>[0]
      );
      const embeddingResponse = await openai.embeddings.create({ model: EMBEDDING_MODEL, input });
      const embedding = embeddingResponse.data[0].embedding;
      await supabase.from("title_embeddings").upsert({ title_id: title.id, embedding, model: EMBEDDING_MODEL });
      embeddingStatus = "ok";
    } catch (e) {
      console.warn(`  (embedding skipped for ${name}: ${e instanceof Error ? e.message : e})`);
    }
  }

  const flags = [
    tasteStatus === "already" ? "already-enriched" : null,
    tasteStatus === "skipped" ? "no-taste" : null,
    embeddingStatus === "skipped" ? "no-embedding" : null,
  ]
    .filter(Boolean)
    .join(", ");
  console.log(`  ok  ${name} (${releaseDate?.slice(0, 4) ?? "?"})${flags ? ` [${flags}]` : ""}`);

  return { taste: tasteStatus, embedding: embeddingStatus };
}

async function main() {
  const { pageStart, pageEnd, lists, mediaType, noAi, concurrency, voteCountGte, dateGte, dateLte } = parseArgs();

  let ok = 0;
  let failed = 0;
  let enriched = 0;
  let totalSeen = 0;

  for (const list of lists) {
    for (let page = pageStart; page <= pageEnd; page++) {
      const isDiscover = list === "discover";
      console.log(
        isDiscover
          ? `Fetching TMDB ${mediaType} discover page ${page} (vote_count>=${voteCountGte}, ${dateGte || "any"}..${dateLte || "any"})...`
          : `Fetching TMDB ${mediaType} "${list}" page ${page}...`
      );
      // Discover's date-range params are named differently per type --
      // "primary_release_date.gte/lte" for movies, "first_air_date.gte/lte"
      // for TV (matching the field TMDB actually filters on server-side).
      const dateGteParam = mediaType === "tv" ? "first_air_date.gte" : "primary_release_date.gte";
      const dateLteParam = mediaType === "tv" ? "first_air_date.lte" : "primary_release_date.lte";
      let listResponse: { results?: TmdbSummary[] };
      try {
        listResponse = isDiscover
          ? await tmdbFetch(`/discover/${mediaType}`, {
              page: String(page),
              sort_by: "popularity.desc",
              "vote_count.gte": voteCountGte,
              ...(dateGte ? { [dateGteParam]: dateGte } : {}),
              ...(dateLte ? { [dateLteParam]: dateLte } : {}),
            })
          : await tmdbFetch(`/${mediaType}/${list}`, { page: String(page) });
      } catch (e) {
        console.error(`  FAIL fetching ${list} page ${page}:`, e instanceof Error ? e.message : e);
        continue;
      }
      const summaries: TmdbSummary[] = listResponse.results ?? [];
      if (!summaries.length) {
        console.log(`  (no results — list may be exhausted)`);
        continue;
      }
      totalSeen += summaries.length;

      await runWithConcurrency(summaries, concurrency, async (summary) => {
        try {
          const result = await ingestOne(summary, noAi, mediaType);
          ok++;
          const tasteDone = result.taste === "ok" || result.taste === "already";
          const embeddingDone = result.embedding === "ok" || result.embedding === "already";
          if (tasteDone && embeddingDone) enriched++;
        } catch (e) {
          failed++;
          console.error(`  FAIL id=${summary.id}:`, e instanceof Error ? e.message : e);
        }
      });
    }
  }

  console.log(
    `\nDone. Saw ${totalSeen} ${mediaType} listings across ${lists.join(", ")} pages ${pageStart}-${pageEnd}; ` +
      `${ok} upserted (dedup'd by tmdb_id+type), ${failed} failed, ${enriched}/${ok} fully AI-enriched.`
  );
  if (ok > enriched) {
    console.log(`Run "npm run enrich:titles" once OpenAI billing is active to backfill the rest.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
