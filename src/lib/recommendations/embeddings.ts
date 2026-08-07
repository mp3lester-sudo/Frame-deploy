import { getOpenAI, EMBEDDING_MODEL } from "@/lib/ai/openai";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/** How many top-billed cast members to fold into a title's embedding input.
 *  Billing order roughly tracks how central/recognizable a role is, and
 *  beyond the top handful the marginal signal drops off fast while token
 *  count keeps climbing -- 5 is enough to capture "this is a Denzel
 *  Washington movie" without bloating every embedding with the full cast
 *  list of an ensemble film. */
const MAX_CAST_FOR_EMBEDDING = 5;

export interface EmbeddingCredits {
  directors: string[];
  topCast: string[];
}

/**
 * Fetches the director(s) and top-billed cast for a title, shaped for
 * buildEmbeddingInput below. Separate from buildEmbeddingInput itself since
 * credits require a DB round trip and the caller may already have this data
 * (e.g. a bulk re-embed script fetching credits for many titles at once).
 */
export async function fetchEmbeddingCredits(
  supabase: ReturnType<typeof createServiceRoleClient>,
  titleId: string
): Promise<EmbeddingCredits> {
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

/**
 * Turns a title's rich metadata into a single text blob the embedding model
 * can reason over. This is the "richer metadata -> better recommendations"
 * bet from the architecture doc — every attribute we capture at ingestion
 * shows up here, not just genre.
 *
 * Director and top-billed cast (via `credits`, optional so existing callers
 * that haven't fetched credits yet don't break) were added after the engine
 * had been live a while — director/cast sensibility is one of the strongest
 * personal-taste predictors there is (see Director of the Day, the whole
 * /person feature), and until this the embedding — and therefore every
 * content-similarity score derived from it — had no way to represent "this
 * person loves films directed by X" or "this person loves anything with Y
 * in it" at all.
 */
export function buildEmbeddingInput(title: Title, credits?: EmbeddingCredits): string {
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
    credits?.directors.length ? `Director: ${credits.directors.join(", ")}` : null,
    credits?.topCast.length ? `Starring: ${credits.topCast.join(", ")}` : null,
  ];
  return parts.filter(Boolean).join("\n");
}

/** Generates and stores the embedding for a single title. Called from the ingestion worker. */
export async function embedTitle(titleId: string) {
  const supabase = createServiceRoleClient();
  const { data: title, error } = await supabase
    .from("titles")
    .select("*")
    .eq("id", titleId)
    .single();
  if (error || !title) throw new Error(`Title ${titleId} not found`);

  const credits = await fetchEmbeddingCredits(supabase, titleId);
  const input = buildEmbeddingInput(title, credits);
  const openai = getOpenAI();
  const response = await openai.embeddings.create({ model: EMBEDDING_MODEL, input });
  const embedding = response.data[0].embedding;

  await supabase.from("title_embeddings").upsert({
    title_id: titleId,
    embedding,
    model: EMBEDDING_MODEL,
  });

  return embedding;
}

/** Batch variant for the nightly ingestion job — embeds every title missing a vector. */
export async function embedMissingTitles(batchSize = 50) {
  const supabase = createServiceRoleClient();
  const { data: titles } = await supabase
    .from("titles")
    .select("id")
    .not("id", "in", `(select title_id from title_embeddings)`)
    .limit(batchSize);

  for (const t of titles ?? []) {
    await embedTitle(t.id);
  }
  return titles?.length ?? 0;
}
