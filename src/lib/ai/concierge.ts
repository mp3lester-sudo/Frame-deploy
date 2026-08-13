import { getOpenAI, EMBEDDING_MODEL, CHAT_MODEL } from "@/lib/ai/openai";
import { createClient } from "@/lib/supabase/server";
import { queryMentionsTitle } from "@/lib/ai/title-mention";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

// How many quality-filtered, semantically-matched candidates to pull from
// the catalogue before handing the shortlist to the LLM. Needs real
// headroom above MAX_PICKS -- a broad request should be able to return a
// large set, and even a narrow request benefits from the model having
// more than the bare minimum to choose the single best fit from.
const CANDIDATE_POOL_SIZE = 60;

// See migration 0063: match_titles_by_query already excludes anything
// below this weighted_rating floor at the SQL level, so in the common
// case every candidate handed to the LLM already clears the bar. This is
// kept here too as a second, independent check on the model's actual
// picks -- belt-and-suspenders against ever surfacing a poorly-rated
// title, since "never, for any reason" shouldn't rely on a single layer
// (a stale RPC deploy, a future refactor that loosens the SQL filter,
// etc.) to hold.
const MIN_WEIGHTED_RATING = 7.3;

const MIN_PICKS_FOR_BROAD_QUERY = 30;
const MAX_PICKS = 40;

const SYSTEM_PROMPT = `You are Backlot's movie concierge: the smartest, most well-watched friend
someone could ask "what should I watch" — never a search engine. Rules:
- The candidate list has already been filtered to highly-rated titles only (see the
  weighted_rating floor in match_titles_by_query) — every candidate has cleared that bar, so
  pick freely from the full list without second-guessing quality.
- Match the number of picks to the request's breadth. A broad, genre-or-mood-level request
  (e.g. "psychological thrillers", "something funny") should return as many strong matching
  candidates as the list supports — aim for at least ${MIN_PICKS_FOR_BROAD_QUERY} when that many
  genuinely fit, up to ${MAX_PICKS}. A narrow, specific request (e.g. "a heist movie set in
  Tokyo with a female lead") should only return titles that genuinely fit — a handful of
  precise matches beats padding the list with loose ones.
- Every recommendation gets one specific, concrete sentence of why it fits THIS request
  (not a generic blurb). Reference tone, pacing, or theme, not just genre.
- If the request is ambiguous, ask one short clarifying question instead of guessing.
- Never recommend a title that isn't in the provided candidate list. (Titles the user explicitly
  named in their own request, e.g. "movies like X", have already been removed from the candidate
  list, so this should never come up -- but never suggest one anyway if you somehow recognize it.)`;

export interface ConciergeResult {
  message: string;
  recommendations: { title: Title; reason: string }[];
}

/**
 * Conversational recommendation flow:
 * 1. Embed the user's natural-language request.
 * 2. Vector-search titles against that embedding (semantic match on mood/theme/plot,
 *    not keyword search), pre-filtered to highly-rated titles only.
 * 3. Hand the candidate shortlist + user message to the LLM, constrained to those
 *    candidates only, so the model explains rather than hallucinates a catalogue.
 * 4. Re-check every returned pick against the same rating floor before returning it --
 *    see MIN_WEIGHTED_RATING above.
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
    p_match_count: CANDIDATE_POOL_SIZE,
    p_min_weighted_rating: MIN_WEIGHTED_RATING,
  });

  // Fallback: if the query-embedding RPC isn't deployed yet, do a coarse
  // metadata filter so the concierge still works during early development.
  // Applies the same rating floor and pool size as the real path, ordered
  // by rating since there's no semantic match to sort by here.
  const rawCandidates: Title[] = candidateMatches?.length
    ? await hydrateTitles(candidateMatches as { title_id: string }[])
    : (
        await supabase
          .from("titles")
          .select("*")
          .gte("weighted_rating", MIN_WEIGHTED_RATING)
          .order("weighted_rating", { ascending: false, nullsFirst: false })
          .limit(CANDIDATE_POOL_SIZE)
      ).data ?? [];

  // Strip any title the user named directly in their own request (see
  // queryMentionsTitle) before the LLM ever sees the list -- structurally
  // impossible to recommend it back, not just discouraged in the prompt.
  const candidates = rawCandidates.filter((t) => !queryMentionsTitle(userQuery, t.name));

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `User request: "${userQuery}"\n\nCandidate titles (JSON, all already highly rated -- choose only from these):\n${JSON.stringify(
          candidates.map((t) => ({ id: t.id, name: t.name, overview: t.overview, mood_tags: t.mood_tags, tone: t.tone, pacing: t.pacing }))
        )}\n\nRespond in strict JSON: { "message": string, "picks": [{ "id": string, "reason": string }] }. For a broad request, aim for at least ${MIN_PICKS_FOR_BROAD_QUERY} picks (up to ${MAX_PICKS}) when that many candidates genuinely fit; for a narrow request, return only the titles that genuinely fit, even if that's far fewer.`,
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
    .map((p) => ({ title: byId.get(p.id)!, reason: p.reason }))
    // Second, independent quality gate -- see MIN_WEIGHTED_RATING's comment.
    .filter((r) => (r.title.weighted_rating ?? 0) >= MIN_WEIGHTED_RATING)
    .slice(0, MAX_PICKS);

  return { message: parsed.message ?? "", recommendations };
}

async function hydrateTitles(matches: { title_id: string }[]): Promise<Title[]> {
  const supabase = await createClient();
  const ids = matches.map((m) => m.title_id);
  const { data } = await supabase.from("titles").select("*").in("id", ids);
  return data ?? [];
}
