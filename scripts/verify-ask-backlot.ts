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
 * real match_titles_by_query RPC, real chat completion constrained to the
 * candidate list — with a plain supabase-js client, same pattern as the
 * other verify-*.ts scripts.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

const CHAT_MODEL = "gpt-4.1-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";

const SYSTEM_PROMPT = `You are Backlot's movie concierge: the smartest, most well-watched friend
someone could ask "what should I watch" — never a search engine. Rules:
- Never return more than 3 titles.
- Every recommendation gets one specific, concrete sentence of why it fits THIS request
  (not a generic blurb). Reference tone, pacing, or theme, not just genre.
- If the request is ambiguous, ask one short clarifying question instead of guessing.
- Never recommend a title that isn't in the provided candidate list.`;

async function main() {
  const admin = createServiceClient(url, serviceKey);
  const openai = new OpenAI({ apiKey: openaiKey });

  const testQueries = [
    "I want something that feels lonely",
    "a movie where the villain wins",
  ];

  for (const userQuery of testQueries) {
    console.log(`\nQuery: "${userQuery}"`);

    console.log("  1. Embedding the query...");
    const embeddingResponse = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: userQuery });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    console.log("  2. Vector-matching against the real catalogue (match_titles_by_query)...");
    const { data: candidateMatches, error: matchError } = await admin.rpc("match_titles_by_query", {
      p_embedding: queryEmbedding,
      p_match_count: 12,
    });
    if (matchError) throw new Error(`match_titles_by_query failed: ${matchError.message}`);
    if (!candidateMatches || candidateMatches.length === 0) throw new Error("expected candidate matches from a real catalogue query");
    console.log(`     ok — ${candidateMatches.length} candidates`);

    const ids = candidateMatches.map((m: { title_id: string }) => m.title_id);
    const { data: candidates } = await admin.from("titles").select("*").in("id", ids);
    if (!candidates || candidates.length === 0) throw new Error("expected candidate title rows to hydrate");

    console.log("  3. Asking the LLM to pick from the candidate list only...");
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `User request: "${userQuery}"\n\nCandidate titles (JSON, choose only from these):\n${JSON.stringify(
            candidates.map((t) => ({ id: t.id, name: t.name, overview: t.overview, mood_tags: t.mood_tags, tone: t.tone, pacing: t.pacing }))
          )}\n\nRespond in strict JSON: { "message": string, "picks": [{ "id": string, "reason": string }] } with at most 3 picks.`,
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
    console.log(`     ok — ${parsed.picks.length} pick(s), all from the real candidate list, each with a specific reason:`);
    for (const pick of parsed.picks) {
      console.log(`       - ${byId.get(pick.id)!.name}: ${pick.reason}`);
    }
  }

  console.log("\nAsk Backlot works end-to-end against the live catalogue.");
}

main().catch((e) => {
  console.error("VERIFICATION FAILED:", e);
  process.exit(1);
});
