import { getOpenAI, EMBEDDING_MODEL } from "@/lib/ai/openai";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * Turns a title's rich metadata into a single text blob the embedding model
 * can reason over. This is the "richer metadata -> better recommendations"
 * bet from the architecture doc — every attribute we capture at ingestion
 * shows up here, not just genre.
 */
export function buildEmbeddingInput(title: Title): string {
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

/** Generates and stores the embedding for a single title. Called from the ingestion worker. */
export async function embedTitle(titleId: string) {
  const supabase = createServiceRoleClient();
  const { data: title, error } = await supabase
    .from("titles")
    .select("*")
    .eq("id", titleId)
    .single();
  if (error || !title) throw new Error(`Title ${titleId} not found`);

  const input = buildEmbeddingInput(title);
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
