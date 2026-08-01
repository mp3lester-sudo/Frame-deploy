import { describe, it, expect } from "vitest";
import { computeTasteDnaFromRatings, type RatedTitleFeatures } from "@/lib/taste-dna/archetypes";

function makeRated(overrides: Partial<RatedTitleFeatures> = {}): RatedTitleFeatures {
  return {
    weight: 1,
    genres: [],
    tone: [],
    themes: [],
    moodTags: [],
    decade: null,
    originalLanguage: "en",
    directorId: null,
    directorName: null,
    pacing: null,
    violenceLevel: null,
    comedyLevel: null,
    emotionalIntensity: null,
    ...overrides,
  };
}

describe("computeTasteDnaFromRatings", () => {
  it("scores Neo-Noir high for a user who loves crime/thriller titles and low for comfort comedy", () => {
    const rated: RatedTitleFeatures[] = [
      makeRated({ genres: ["Crime", "Thriller"], tone: ["cynical", "morally gray"], weight: 2.5 }),
      makeRated({ genres: ["Crime", "Mystery"], tone: ["noir", "shadow"], weight: 2 }),
      makeRated({ genres: ["Thriller"], tone: ["hardboiled"], weight: 1.5 }),
    ];

    const result = computeTasteDnaFromRatings(rated);
    const neoNoir = result.archetypes.find((a) => a.name === "Neo-Noir")!;
    const feelGood = result.archetypes.find((a) => a.name === "Feel-Good Comfort")!;

    expect(neoNoir.percent).toBeGreaterThan(70);
    expect(feelGood.percent).toBe(0);
  });

  it("ignores titles the user disliked (weight <= 0) when building the profile", () => {
    const rated: RatedTitleFeatures[] = [
      makeRated({ genres: ["Comedy"], weight: 0 }), // disliked — a 2.5/5 rating nets to 0 weight
      makeRated({ genres: ["Horror"], weight: 2.5 }),
    ];

    const result = computeTasteDnaFromRatings(rated);
    expect(result.sampleSize).toBe(1);
    expect(result.favoriteGenres).toEqual(["Horror"]);
  });

  it("weights genre 100% until any rated title has enrichment data, then blends in tone/theme/mood", () => {
    const unenriched: RatedTitleFeatures[] = [makeRated({ genres: ["Horror"], weight: 2 })];
    const withEnrichment: RatedTitleFeatures[] = [
      makeRated({ genres: ["Horror"], tone: ["dread", "unsettling"], weight: 2 }),
    ];

    const before = computeTasteDnaFromRatings(unenriched);
    const after = computeTasteDnaFromRatings(withEnrichment);

    expect(before.enrichedSampleSize).toBe(0);
    expect(after.enrichedSampleSize).toBe(1);
    expect(before.archetypes.find((a) => a.name === "Horror & Dread")!.percent).toBeGreaterThan(0);
    expect(after.archetypes.find((a) => a.name === "Horror & Dread")!.percent).toBeGreaterThan(0);
  });

  it("flags non-English originals as World Cinema Explorer even with no matching genre", () => {
    const rated: RatedTitleFeatures[] = [
      makeRated({ genres: ["Drama"], originalLanguage: "ko", weight: 2 }),
      makeRated({ genres: ["Drama"], originalLanguage: "fr", weight: 1 }),
    ];

    const result = computeTasteDnaFromRatings(rated);
    expect(result.archetypes.find((a) => a.name === "World Cinema Explorer")!.percent).toBe(100);
  });

  it("computes weighted favorite genres, decades, and directors from positive ratings only", () => {
    const rated: RatedTitleFeatures[] = [
      makeRated({ genres: ["Drama"], decade: "1990s", directorId: "d1", directorName: "Director A", weight: 2.5 }),
      makeRated({ genres: ["Drama"], decade: "1990s", directorId: "d1", directorName: "Director A", weight: 1.5 }),
      makeRated({ genres: ["Comedy"], decade: "2010s", directorId: "d2", directorName: "Director B", weight: 0.5 }),
    ];

    const result = computeTasteDnaFromRatings(rated);
    expect(result.favoriteGenres[0]).toBe("Drama");
    expect(result.favoriteDecades[0]).toBe("1990s");
    expect(result.favoriteDirectors[0]).toEqual({ id: "d1", name: "Director A" });
  });

  it("returns null pacing/violence/comedy/emotional-intensity preferences when no rated title has that data", () => {
    const rated: RatedTitleFeatures[] = [makeRated({ genres: ["Drama"], weight: 2 })];
    const result = computeTasteDnaFromRatings(rated);

    expect(result.pacingPreference).toBeNull();
    expect(result.violenceTolerance).toBeNull();
    expect(result.comedyTolerance).toBeNull();
    expect(result.emotionalIntensityPreference).toBeNull();
  });

  it("averages violence/comedy/emotional-intensity across rated titles that do have it", () => {
    const rated: RatedTitleFeatures[] = [
      makeRated({ genres: ["Horror"], violenceLevel: 4, weight: 2 }),
      makeRated({ genres: ["Horror"], violenceLevel: 2, weight: 2 }),
    ];
    const result = computeTasteDnaFromRatings(rated);
    expect(result.violenceTolerance).toBe(3);
  });

  it("cites the highest-weight titles and matched keywords behind an archetype score", () => {
    const rated: RatedTitleFeatures[] = [
      makeRated({
        titleId: "t1",
        titleName: "Chinatown",
        genres: ["Crime", "Mystery"],
        tone: ["noir", "morally gray"],
        weight: 2.5,
      }),
      makeRated({
        titleId: "t2",
        titleName: "The Long Goodbye",
        genres: ["Crime"],
        tone: ["cynical"],
        weight: 2,
      }),
      makeRated({
        titleId: "t3",
        titleName: "Paddington",
        genres: ["Comedy", "Family"],
        weight: 1,
      }),
    ];

    const result = computeTasteDnaFromRatings(rated);
    const neoNoir = result.archetypes.find((a) => a.name === "Neo-Noir")!;

    expect(neoNoir.citedTitles.map((t) => t.name)).toEqual(["Chinatown", "The Long Goodbye"]);
    expect(neoNoir.matchedKeywords).toEqual(expect.arrayContaining(["noir", "morally gray", "cynical"]));

    const horror = result.archetypes.find((a) => a.name === "Horror & Dread")!;
    expect(horror.citedTitles).toEqual([]);
  });

  it("leaves citedTitles empty when rows have no titleId/titleName (e.g. existing callers)", () => {
    const rated: RatedTitleFeatures[] = [makeRated({ genres: ["Horror"], tone: ["dread"], weight: 2 })];
    const result = computeTasteDnaFromRatings(rated);
    expect(result.archetypes.find((a) => a.name === "Horror & Dread")!.citedTitles).toEqual([]);
  });

  it("builds a weighted mood/tone/theme breakdown across enriched titles only", () => {
    const rated: RatedTitleFeatures[] = [
      makeRated({ genres: ["Horror"], tone: ["dread"], weight: 3 }),
      makeRated({ genres: ["Horror"], tone: ["dread"], themes: ["isolation"], weight: 1 }),
      makeRated({ genres: ["Comedy"], weight: 5 }), // not enriched -- excluded from the breakdown's total
    ];
    const result = computeTasteDnaFromRatings(rated);
    expect(result.moodBreakdown[0]).toEqual({ tag: "dread", percent: 100 });
    expect(result.moodBreakdown.find((m) => m.tag === "isolation")).toEqual({ tag: "isolation", percent: 25 });
  });

  it("builds a full language breakdown with human-readable labels, not just the top pick", () => {
    const rated: RatedTitleFeatures[] = [
      makeRated({ originalLanguage: "en", weight: 3 }),
      makeRated({ originalLanguage: "ko", weight: 1 }),
    ];
    const result = computeTasteDnaFromRatings(rated);
    expect(result.languageBreakdown).toEqual([
      { label: "English", percent: 75 },
      { label: "Korean", percent: 25 },
    ]);
  });

  it("builds a chronologically-sorted full era distribution, not just the top 3 decades", () => {
    const rated: RatedTitleFeatures[] = [
      makeRated({ decade: "1970s", weight: 1 }),
      makeRated({ decade: "1990s", weight: 1 }),
      makeRated({ decade: "1990s", weight: 1 }),
      makeRated({ decade: "2020s", weight: 2 }),
    ];
    const result = computeTasteDnaFromRatings(rated);
    expect(result.eraDistribution).toEqual([
      { decade: "1970s", percent: 20 },
      { decade: "1990s", percent: 40 },
      { decade: "2020s", percent: 40 },
    ]);
  });
});
