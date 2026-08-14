import { getOpenAI, EMBEDDING_MODEL, CHAT_MODEL } from "@/lib/ai/openai";
import { createClient } from "@/lib/supabase/server";
import {
  queryMentionsTitle,
  releaseYearFromDate,
  computeYearWindow,
  type MentionedTitle,
} from "@/lib/ai/title-mention";
import type { Database } from "@/lib/supabase/types";
import type { MediaType } from "@/lib/context/media-type-cookie";

type Title = Database["public"]["Tables"]["titles"]["Row"];

const CANDIDATE_POOL_SIZE = 60;
const MIN_WEIGHTED_RATING = 7.3;
const MIN_PICKS_FOR_BROAD_QUERY = 30;
const MAX_PICKS = 40;

// The default shape for a normal "what should I watch" ask -- one that's
// neither a bare genre/mood browse (which wants MIN_PICKS_FOR_BROAD_QUERY+)
// nor a hyper-specific ask (which wants only the handful that truly fit).
// Most everyday requests land here, so this is what "give me picks" means
// absent either extreme: a short, confidently-ordered list rather than a
// wall of 30, with the strongest few called out separately so someone
// doesn't have to read all 8 reasons to know where to start.
const UNIVERSAL_PICK_COUNT = 8;
const TOP_PICK_COUNT = 3;

const SYSTEM_PROMPT = `You are Marquee's movie concierge: the smartest, most well-watched friend
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
- Never recommend a title that isn't in the provided candidate list. (Titles the user explicitly
  named in their own request, e.g. "movies like X", have already been removed from the candidate
  list, so this should never come up -- but never suggest one anyway if you somehow recognize it.)
- If the candidate list is restricted to a specific release-year window (noted below, when
  present), every candidate already falls inside it -- pick freely, no need to double-check years.`;

export interface ConciergeResult {
  message: string;
  recommendations: { title: Title; reason: string }[];
  /** The strongest `TOP_PICK_COUNT` of `recommendations`, in order -- a
   *  subset (same objects), not a separate pool, so callers that only want
   *  the headline picks don't have to duplicate the ordering logic. */
  topPicks: { title: Title; reason: string }[];
  /** The release-year window recommendations were restricted to, or null
   *  if era-matching was off or nothing in the query anchored a year. */
  yearWindow: { minYear: number; maxYear: number } | null;
}

export interface AskConciergeOptions {
  /** When true (default) and the request names a specific movie, recommendations
   *  are restricted to within title-mention.ts's YEAR_WINDOW years of that movie's
   *  release. Set false to ignore era entirely -- the user-facing toggle on /ai. */
  matchEra?: boolean;
  /** Movies/Shows toggle state -- restricts the candidate pool to just this
   *  type, same as every other recommendation surface (see engine.ts). */
  mediaType: MediaType;
}

export async function askConcierge(
  userQuery: string,
  options: AskConciergeOptions
): Promise<ConciergeResult> {
  const matchEra = options.matchEra ?? true;
  const { mediaType } = options;
  const openai = getOpenAI();
  const supabase = await createClient();

  const yearWindow = matchEra ? await resolveYearWindow(supabase, userQuery) : null;

  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: userQuery,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data: candidateMatches } = await supabase.rpc("match_titles_by_query", {
    p_embedding: queryEmbedding,
    p_match_count: CANDIDATE_POOL_SIZE,
    p_min_weighted_rating: MIN_WEIGHTED_RATING,
    p_min_release_year: yearWindow?.minYear ?? null,
    p_max_release_year: yearWindow?.maxYear ?? null,
    p_media_type: mediaType,
  });

  let rawCandidates: Title[] = candidateMatches?.length
    ? await hydrateTitles(candidateMatches as { title_id: string }[])
    : [];

  if (!rawCandidates.length) {
    let fallbackQuery = supabase
      .from("titles")
      .select("*")
      .eq("type", mediaType)
      .gte("weighted_rating", MIN_WEIGHTED_RATING);
    if (yearWindow) {
      fallbackQuery = fallbackQuery
        .gte("release_date", `${yearWindow.minYear}-01-01`)
        .lte("release_date", `${yearWindow.maxYear}-12-31`);
    }
    const { data } = await fallbackQuery
      .order("weighted_rating", { ascending: false, nullsFirst: false })
      .limit(CANDIDATE_POOL_SIZE);
    rawCandidates = data ?? [];
  }

  const candidates = rawCandidates
    .filter((t) => !queryMentionsTitle(userQuery, t.name))
    .filter((t) => withinYearWindow(t.release_date, yearWindow));

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `User request: "${userQuery}"${
          yearWindow
            ? `\n\nCandidates are restricted to titles released ${yearWindow.minYear}-${yearWindow.maxYear}.`
            : ""
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

  const byId = new Map(candidates.map((t) => [t.id, t]));
  const recommendations = (parsed.picks ?? [])
    .filter((p) => byId.has(p.id))
    .map((p) => ({ title: byId.get(p.id)!, reason: p.reason }))
    .filter((r) => (r.title.weighted_rating ?? 0) >= MIN_WEIGHTED_RATING)
    .filter((r) => withinYearWindow(r.title.release_date, yearWindow))
    .slice(0, MAX_PICKS);

  const topPicks = recommendations.slice(0, TOP_PICK_COUNT);

  return { message: parsed.message ?? "", recommendations, topPicks, yearWindow };
}

/** Independent of the weighted_rating quality floor -- see 0064's docblock
 *  on find_titles_mentioned_in_query for why the anchor movie itself must
 *  never be subject to that floor. */
async function resolveYearWindow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userQuery: string
): Promise<{ minYear: number; maxYear: number } | null> {
  const { data: nameMatches } = await supabase.rpc("find_titles_mentioned_in_query", {
    p_query: userQuery,
  });
  const mentioned: MentionedTitle[] = (nameMatches ?? [])
    .filter((m: { name: string }) => queryMentionsTitle(userQuery, m.name))
    .map((m: { name: string; release_date: string | null }) => ({
      name: m.name,
      releaseYear: releaseYearFromDate(m.release_date),
    }));
  return computeYearWindow(mentioned);
}

function withinYearWindow(
  releaseDate: string | null,
  yearWindow: { minYear: number; maxYear: number } | null
): boolean {
  if (!yearWindow) return true;
  const year = releaseYearFromDate(releaseDate);
  return year !== null && year >= yearWindow.minYear && year <= yearWindow.maxYear;
}

async function hydrateTitles(matches: { title_id: string }[]): Promise<Title[]> {
  const supabase = await createClient();
  const ids = matches.map((m) => m.title_id);
  const { data } = await supabase.from("titles").select("*").in("id", ids);
  return data ?? [];
}
