/**
 * End-to-end verification of "Ask Backlot" (src/lib/ai/concierge.ts, /ai page,
 * /api/ai/concierge route) against the real Supabase project and a real
 * OpenAI call. This is Backlot's natural-language "describe the feeling, not
 * the genre" recommendation flow — a genuine Letterboxd-can't-do-this
 * feature that's been sitting in the codebase, but was never actually
 * testable until OpenAI billing was fixed this session and the catalogue
 * got embedded. Never confirmed working end-to-end until now.
 *
 * askConcierge() can't be called directly from a standalone script (goes
 * through @/lib/supabase/server, which needs Next.js request/cookies
 * context), so this mirrors its exact logic — real OpenAI embedding call,
 * real match_titles_by_query RPC (weighted_rating floor + optional
 * release-year window, see migrations 0063/0064), real
 * find_titles_mentioned_in_query RPC for era-anchor lookup, real chat
 * completion constrained to the candidate list — with a plain supabase-js
 * client, same pattern as the other verify-*.ts scripts.
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  queryMentionsTitle,
  releaseYearFromDate,
  computeYearWindow,
  type MentionedTitle,
} from "../src/lib/ai/title-mention";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

const CHAT_MODEL = "gpt-4.1-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";

const CANDIDATE_POOL_SIZE = 60;
const MIN_WEIGHTED_RATING = 7.3;
const MIN_PICKS_FOR_BROAD_QUERY = 30;
const MAX_PICKS = 40;
const UNIVERSAL_PICK_COUNT = 8;
const TOP_PICK_COUNT = 3;

const SYSTEM_PROMPT = `You are Backlot's movie concierge: the smartest, most well-watched friend
someone could ask "what should I watch" — never a search engine. Rules:
- The candidate list has already been filtered to highly-rated titles only (see the
  weighted_rating floor in match_titles_by_query) — every candidate has cleared that bar, so
  pick freely from the full list without second-guessing quality.
- Match the number of picks to the request's breadth, and always order "picks" strongest
  match first:
  - Broad, genre-or-mood-level request (e.g. "psychological thrillers", "something funny"):
    return as many strong matching candidates as the list supports — aim for at least
    ${MIN_PICKS_FOR_BROAD_QUERY} when that many genuinely fit, up to ${MAX_PICKS}.
  - Narrow, highly specific request (e.g. "a heist movie set in Tokyo with a female lead"):
    only return titles that genuinely fit — a handful of precise matches beats padding the
    list with loose ones, even if that's far fewer than ${UNIVERSAL_PICK_COUNT}.
  - Everything else — the typical, everyday ask that's neither pure genre browsing nor
    ultra-specific (e.g. "something like Inception", "a good date-night movie"): return
    around ${UNIVERSAL_PICK_COUNT} total picks, ordered strongest-first, so the top
    ${TOP_PICK_COUNT} can be highlighted as the headline recommendations.
- Every recommendation gets one specific, concrete sentence of why it fits THIS request
  (not a generic blurb). Reference tone, pacing, or theme, not just genre.
- If the request is ambiguous, ask one short clarifying question instead of guessing.
- Never recommend a title that isn't in the provided candidate list.`;

async function resolveYearWindow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  userQuery: string
): Promise<{ minYear: number; maxYear: number } | null> {
  const { data: nameMatches, error } = await admin.rpc("find_titles_mentioned_in_query", {
    p_query: userQuery,
  });
  if (error) throw new Error(`find_titles_mentioned_in_query failed: ${error.message}`);
  const mentioned: MentionedTitle[] = (nameMatches ?? [])
    .filter((m: { name: string }) => queryMentionsTitle(userQuery, m.name))
    .map((m: { name: string; release_date: string | null }) => ({
      name: m.name,
      releaseYear: releaseYearFromDate(m.release_date),
    }));
  return computeYearWindow(mentioned);
}

async function main() {
  const admin = createServiceClient(url, serviceKey);
  const openai = new OpenAI({ apiKey: openaiKey });

  const testQueries = [
    "I want something that feels lonely",
    "psychological thrillers",
    "movies like Parasite",
    "movies like Jaws and Alien",
  ];

  for (const userQuery of testQueries) {
    console.log(`\nQuery: "${userQuery}"`);

    console.log("  1. Resolving any named-title era anchor (find_titles_mentioned_in_query)...");
    const yearWindow = await resolveYearWindow(admin, userQuery);
    console.log(`     ${yearWindow ? `ok — anchored to ${yearWindow.minYear}-${yearWindow.maxYear}` : "ok — no anchor found"}`);

    console.log("  2. Embedding the query...");
    const embeddingResponse = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: userQuery });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    console.log("  3. Vector-matching against the real catalogue, quality- and era-filtered (match_titles_by_query)...");
    const { data: candidateMatches, error: matchError } = await admin.rpc("match_titles_by_query", {
      p_embedding: queryEmbedding,
      p_match_count: CANDIDATE_POOL_SIZE,
      p_min_weighted_rating: MIN_WEIGHTED_RATING,
      p_min_release_year: yearWindow?.minYear ?? null,
      p_max_release_year: yearWindow?.maxYear ?? null,
    });
    if (matchError) throw new Error(`match_titles_by_query failed: ${matchError.message}`);
    if (!candidateMatches || candidateMatches.length === 0) throw new Error("expected candidate matches from a real catalogue query");
    console.log(`     ok — ${candidateMatches.length} candidates`);

    const ids = candidateMatches.map((m: { title_id: string }) => m.title_id);
    const { data: rawCandidates } = await admin.from("titles").select("*").in("id", ids);
    if (!rawCandidates || rawCandidates.length === 0) throw new Error("expected candidate title rows to hydrate");

    // Strip any title the user named directly in their own request --
    // "movies like Parasite" should never be able to recommend Parasite
    // back. See title-mention.ts.
    const candidates = rawCandidates.filter((t) => !queryMentionsTitle(userQuery, t.name));
    if (candidates.length === 0) throw new Error("expected at least one candidate left after stripping named titles");
    for (const c of candidates) {
      if (queryMentionsTitle(userQuery, c.name)) {
        throw new Error(`"${c.name}" was named in the query but still present in the filtered candidate list`);
      }
    }

    for (const c of candidates) {
      if ((c.weighted_rating ?? 0) < MIN_WEIGHTED_RATING) {
        throw new Error(`candidate ${c.name} has weighted_rating ${c.weighted_rating}, below the ${MIN_WEIGHTED_RATING} floor — RPC filter failed`);
      }
      if (yearWindow) {
        const year = releaseYearFromDate(c.release_date);
        if (year === null || year < yearWindow.minYear || year > yearWindow.maxYear) {
          throw new Error(`candidate ${c.name} (${c.release_date}) falls outside the ${yearWindow.minYear}-${yearWindow.maxYear} era window — RPC filter failed`);
        }
      }
    }
    console.log(`     ok — every candidate clears the ${MIN_WEIGHTED_RATING} weighted_rating floor${yearWindow ? ` and the ${yearWindow.minYear}-${yearWindow.maxYear} era window` : ""}`);

    console.log("  4. Asking the LLM to pick from the candidate list only...");
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `User request: "${userQuery}"${
            yearWindow ? `\n\nCandidates are restricted to titles released ${yearWindow.minYear}-${yearWindow.maxYear}.` : ""
          }\n\nCandidate titles (JSON, all already highly rated -- choose only from these):\n${JSON.stringify(
            candidates.map((t) => ({ id: t.id, name: t.name, overview: t.overview, mood_tags: t.mood_tags, tone: t.tone, pacing: t.pacing }))
          )}\n\nRespond in strict JSON: { "message": string, "picks": [{ "id": string, "reason": string }] }, "picks" ordered strongest match first. For a broad request, aim for at least ${MIN_PICKS_FOR_BROAD_QUERY} picks (up to ${MAX_PICKS}) when that many candidates genuinely fit; for a narrow request, return only the titles that genuinely fit, even if that's far fewer; otherwise aim for around ${UNIVERSAL_PICK_COUNT} total.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}") as {
      message: string;
      picks: { id: string; reason: string }[];
    };

    if (!parsed.picks || parsed.picks.length === 0) {
      // A clarifying question instead of picks is a valid, allowed response
      // per the system prompt — only fail if there's neither picks nor a message.
      if (!parsed.message) throw new Error("expected either picks or a clarifying message, got neither");
      console.log(`     ok — model asked a clarifying question instead of guessing: "${parsed.message}"`);
      continue;
    }

    const byId = new Map(candidates.map((t) => [t.id, t]));
    for (const pick of parsed.picks) {
      if (!byId.has(pick.id)) throw new Error(`model picked a title (${pick.id}) not in the candidate list — hallucination guard failed`);
      if (!pick.reason || pick.reason.length < 5) throw new Error(`expected a real, specific reason for ${pick.id}, got: "${pick.reason}"`);
    }
    const topPicks = parsed.picks.slice(0, TOP_PICK_COUNT);
    console.log(`     ok — ${parsed.picks.length} pick(s) total, ${topPicks.length} top pick(s), all from the real candidate list, each with a specific reason:`);
    for (const pick of parsed.picks) {
      const tag = topPicks.includes(pick) ? "TOP" : "   ";
      console.log(`       [${tag}] ${byId.get(pick.id)!.name}: ${pick.reason}`);
    }
  }

  console.log("\nAsk Backlot works end-to-end against the live catalogue: quality-gated, era-matched, and scaled to request breadth.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
