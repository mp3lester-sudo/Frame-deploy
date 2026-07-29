import { getOpenAI, EMBEDDING_MODEL, CHAT_MODEL } from "@/lib/ai/openai";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

const SYSTEM_PROMPT = `You are Backlot's movie concierge: the smartest, most well-watched friend
someone could ask "what should I watch" — never a search engine. Rules:
- Never return more than 3 titles.
- Every recommendation gets one specific, concrete sentence of why it fits THIS request
  (not a generic blurb). Reference tone, pacing, or theme, not just genre.
- If the request is ambiguous, ask one short clarifying question instead of guessing.
- Never recommend a title that isn't in the provided candidate list.`;

export interface ConciergeResult {
  message: string;
  recommendations: { title: Title; reason: string }[];
}

/**
 * Conversational recommendation flow:
 * 1. Embed the user's natural-language request.
 * 2. Vector-search titles against that embedding (semantic match on mood/theme/plot,
 *    not keyword search).
 * 3. Hand the candidate shortlist + user message to the LLM, constrained to those
 *    candidates only, so the model explains rather than hallucinates a catalogue.
 */
export async function askConcierge(userQuery: string): Promise<ConciergeResult> {
  const openai = getOpenAI();
  const supabase = await createClient();

  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: userQuery,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data: candidateMatches } = await supabase.rpc("match_titles_by_query", {
    p_embedding: queryEmbedding,
    p_match_count: 12,
  });

  // Fallback: if the query-embedding RPC isn't deployed yet, do a coarse
  // metadata filter so the concierge still works during early development.
  const candidates: Title[] = candidateMatches?.length
    ? await hydrateTitles(candidateMatches as { title_id: string }[])
    : (await supabase.from("titles").select("*").limit(12)).data ?? [];

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

  const byId = new Map(candidates.map((t) => [t.id, t]));
  const recommendations = (parsed.picks ?? [])
    .filter((p) => byId.has(p.id))
    .map((p) => ({ title: byId.get(p.id)!, reason: p.reason }));

  return { message: parsed.message ?? "", recommendations };
}

async function hydrateTitles(matches: { title_id: string }[]): Promise<Title[]> {
  const supabase = await createClient();
  const ids = matches.map((m) => m.title_id);
  const { data } = await supabase.from("titles").select("*").in("id", ids);
  return data ?? [];
}
