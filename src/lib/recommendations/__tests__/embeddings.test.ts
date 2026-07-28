import { describe, it, expect } from "vitest";
import { buildEmbeddingInput } from "@/lib/recommendations/embeddings";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

function makeTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    tmdb_id: 1,
    type: "movie",
    name: "Arrival",
    original_name: null,
    overview: "A linguist deciphers an alien language.",
    release_date: "2016-11-11",
    runtime_minutes: 116,
    poster_url: null,
    backdrop_url: null,
    original_language: "en",
    genres: ["Sci-Fi", "Drama"],
    themes: ["communication", "time"],
    tone: ["contemplative"],
    pacing: "slow",
    violence_level: 1,
    comedy_level: 0,
    emotional_intensity: 4,
    dialogue_density: 3,
    ending_type: "twist",
    color_palette: null,
    mood_tags: ["melancholy", "thought-provoking"],
    tmdb_rating: 7.9,
    tmdb_vote_count: 12000,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildEmbeddingInput", () => {
  it("includes every populated metadata field the recommendation engine relies on", () => {
    const input = buildEmbeddingInput(makeTitle());

    expect(input).toContain("Title: Arrival");
    expect(input).toContain("Genres: Sci-Fi, Drama");
    expect(input).toContain("Themes: communication, time");
    expect(input).toContain("Tone: contemplative");
    expect(input).toContain("Pacing: slow");
    expect(input).toContain("Mood: melancholy, thought-provoking");
    expect(input).toContain("Ending: twist");
    expect(input).toContain("Emotional intensity (0-5): 4");
  });

  it("omits empty or null fields instead of emitting blank lines", () => {
    const input = buildEmbeddingInput(
      makeTitle({ themes: [], tone: [], mood_tags: [], overview: null, ending_type: null })
    );

    expect(input).not.toContain("Themes:");
    expect(input).not.toContain("Tone:");
    expect(input).not.toContain("Mood:");
    expect(input).not.toContain("Overview:");
    expect(input).not.toContain("Ending:");
  });
});
