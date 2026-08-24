import { getOpenAI, EMBEDDING_MODEL, CHAT_MODEL } from "@/lib/ai/openai";
import { createClient } from "@/lib/supabase/server";
import {
  queryMentionsTitle,
  releaseYearFromDate,
  computeYearWindow,
  type MentionedTitle,
} from "@/lib/ai/title-mention";
import { computeGenreAffinity } from "@/lib/recommendations/genre-affinity";
import { rankFavoriteDirectors } from "@/lib/director-of-day/pick";
import type { Database } from "@/lib/supabase/types";
import type { MediaType } from "@/lib/context/media-type-cookie";

type Title = Database["public"]["Tables"]["titles"]["Row"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

// How many favorite genres/directors get surfaced to the model as a
// tie-breaking hint (see buildTasteContext) -- short and explainable,
// not this user's entire taste profile.
const TASTE_HINT_COUNT = 3;

const SYSTEM_PROMPT = `You are Slate's movie concierge: the smartest, most well-watched friend
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
  present), every candidate already falls inside it -- pick freely, no need to double-check years.
- Titles this person has already watched or explicitly disliked have already been removed from
  the candidate list entirely -- never worry about re-recommending something they've seen.
- When this person's favorite genres/directors are noted below and multiple candidates fit the
  request roughly equally well, prefer the one(s) that also match those favorites -- but never
  let a favorite override genuine fit: a candidate that fits the request better always wins over
  one that merely matches a favorite genre or director.`;

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
  /** Personalization audit finding: askConcierge() never received a userId,
   *  so "recommend a good heist movie" answered identically for every
   *  account -- no taste-vector grounding, no exclusion of already-watched
   *  titles, no awareness of favorite directors/genres. When present,
   *  already-watched/disliked titles are dropped from the candidate pool
   *  before the model ever sees them, and a short favorite-genres/
   *  directors summary is passed along as a tie-break hint (see
   *  buildTasteContext below). The /api/ai/concierge route always has a
   *  verified session, so this is effectively always set in production;
   *  optional here so askConcierge stays testable/callable without one. */
  userId?: string;
}

interface TasteContext {
  /** Every title already watched (any rating at all, or a watch_history
   *  row) or explicitly passed on (a Discover swipe-deck dismissal) --
   *  removed from the candidate pool outright rather than merely
   *  down-weighted, since "what should I watch" recommending something
   *  already seen or already passed on defeats the point in a way a soft
   *  penalty (the kind dislike-penalty.ts applies elsewhere) wouldn't
   *  fix. Deliberately every rating, not just low ones -- a title someone
   *  loved is exactly as pointless to "recommend" as one they hated. */
  excludeTitleIds: Set<string>;
  /** Top positive-affinity genres (computeGenreAffinity, same module the
   *  solo recommendation engine uses), most favored first. */
  favoriteGenres: string[];
  /** Top favorite directors by rankFavoriteDirectors (same ranking
   *  Director of the Day uses), most favored first. */
  favoriteDirectors: string[];
}

/**
 * Gathers this viewer's taste signal for grounding a concierge answer.
 * Reuses the exact same modules/definitions the solo recommendation
 * engine and Director of the Day already use (computeGenreAffinity,
 * rankFavoriteDirectors, the ratings<=2.5-or-dismissed "disliked"
 * definition) rather than inventing a parallel notion of "favorite" or
 * "disliked" specific to Ask Slate. Returns empty/neutral (not null) for
 * a user with no rating history yet -- same "don't fake it" convention as
 * getDirectorOfTheDay, just expressed as empty collections here since
 * askConcierge always has a candidate list to fall back to either way.
 */
async function buildTasteContext(
  supabase: SupabaseServerClient,
  userId: string,
  mediaType: MediaType
): Promise<TasteContext> {
  const [{ data: ratings }, { data: watchHistory }, { data: dismissals }] = await Promise.all([
    supabase.from("ratings").select("title_id, score").eq("user_id", userId),
    supabase.from("watch_history").select("title_id").eq("user_id", userId),
    supabase.from("title_dismissals").select("title_id").eq("user_id", userId),
  ]);

  const excludeTitleIds = new Set<string>([
    ...(ratings ?? []).map((r) => r.title_id),
    ...(watchHistory ?? []).map((w) => w.title_id),
    ...(dismissals ?? []).map((d) => d.title_id),
  ]);

  if (!ratings?.length) {
    return { excludeTitleIds, favoriteGenres: [], favoriteDirectors: [] };
  }

  const ratedTitleIds = ratings.map((r) => r.title_id);
  const [{ data: ratedTitleGenres }, { data: directorCredits }] = await Promise.all([
    supabase.from("titles").select("id, genres").eq("type", mediaType).in("id", ratedTitleIds),
    supabase
      .from("title_credits")
      .select("title_id, people(id, name)")
      .eq("credit_type", "director")
      .in("title_id", ratedTitleIds),
  ]);

  const genresByTitleId = new Map((ratedTitleGenres ?? []).map((t) => [t.id, t.genres]));
  const genreAffinity = computeGenreAffinity(
    ratings.map((r) => ({ score: Number(r.score), genres: genresByTitleId.get(r.title_id) ?? null }))
  );
  const favoriteGenres = [...genreAffinity.entries()]
    .filter(([, entry]) => entry.affinity > 0)
    .sort((a, b) => b[1].affinity - a[1].affinity)
    .slice(0, TASTE_HINT_COUNT)
    .map(([genre]) => genre);

  const directorByTitle = new Map<string, { id: string; name: string }>();
  for (const credit of directorCredits ?? []) {
    const person = (credit as unknown as { people: { id: string; name: string } | null }).people;
    if (person) directorByTitle.set(credit.title_id, person);
  }
  const favoriteDirectors = rankFavoriteDirectors(
    ratings.map((r) => ({ titleId: r.title_id, score: Number(r.score) })),
    directorByTitle
  )
    .slice(0, TASTE_HINT_COUNT)
    .map((d) => d.name);

  return { excludeTitleIds, favoriteGenres, favoriteDirectors };
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

  // Independent of each other and of yearWindow above, so fetched together
  // rather than as two sequential round trips -- see buildTasteContext for
  // why this is a separate query batch keyed off options.userId rather
  // than folded into the RPC call below.
  const [embeddingResponse, tasteContext] = await Promise.all([
    openai.embeddings.create({ model: EMBEDDING_MODEL, input: userQuery }),
    options.userId ? buildTasteContext(supabase, options.userId, mediaType) : Promise.resolve(null),
  ]);
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
    .filter((t) => withinYearWindow(t.release_date, yearWindow))
    .filter((t) => !tasteContext?.excludeTitleIds.has(t.id));

  // Tie-break hint, not a hard filter -- the system prompt is explicit that
  // genuine fit to the request always wins over merely matching a
  // favorite (see SYSTEM_PROMPT's taste-grounding rule). Omitted entirely
  // for a logged-out/no-history caller rather than sent empty.
  const favoritesNoted: string[] = [];
  if (tasteContext?.favoriteGenres.length) favoritesNoted.push(`genres they love: ${tasteContext.favoriteGenres.join(", ")}`);
  if (tasteContext?.favoriteDirectors.length) favoritesNoted.push(`directors they love: ${tasteContext.favoriteDirectors.join(", ")}`);
  const tasteHint = favoritesNoted.length
    ? `\n\nThis person's favorites, for tie-breaking only: ${favoritesNoted.join("; ")}.`
    : "";

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
        }${tasteHint}\n\nCandidate titles (JSON, all already highly rated and already excludes anything this person has watched or disliked -- choose only from these):\n${JSON.stringify(
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
