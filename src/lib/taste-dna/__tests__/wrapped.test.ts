import { describe, it, expect } from "vitest";
import { computeWrapped, getMonthRange, MIN_RATINGS_FOR_WRAPPED, type WrappedRatedTitle } from "@/lib/taste-dna/wrapped";

function makeRated(overrides: Partial<WrappedRatedTitle> = {}): WrappedRatedTitle {
  return {
    titleId: `title-${Math.random()}`,
    titleName: "Untitled",
    posterUrl: null,
    score: 4,
    weight: 1.5,
    ratedAt: "2026-03-01T00:00:00.000Z",
    runtimeMinutes: 100,
    tmdbVoteCount: 1000,
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

describe("computeWrapped", () => {
  it("returns null below MIN_RATINGS_FOR_WRAPPED", () => {
    const rated = Array.from({ length: MIN_RATINGS_FOR_WRAPPED - 1 }, () => makeRated());
    expect(computeWrapped(rated, 2026)).toBeNull();
  });

  it("computes total count and total hours from runtime", () => {
    const rated = [
      makeRated({ runtimeMinutes: 120 }),
      makeRated({ runtimeMinutes: 90 }),
      makeRated({ runtimeMinutes: 90 }),
      makeRated({ runtimeMinutes: 60 }),
    ];
    const result = computeWrapped(rated, 2026)!;
    expect(result.totalRated).toBe(4);
    expect(result.totalHours).toBe(Math.round(360 / 60));
  });

  it("ranks top genres by raw volume, not by weight", () => {
    const rated = [
      makeRated({ genres: ["Horror"], weight: 0.2 }),
      makeRated({ genres: ["Horror"], weight: 0.2 }),
      makeRated({ genres: ["Horror"], weight: 0.2 }),
      makeRated({ genres: ["Drama"], weight: 2.5 }),
    ];
    const result = computeWrapped(rated, 2026)!;
    expect(result.topGenres[0].genre).toBe("Horror");
    expect(result.topGenres[0].count).toBe(3);
  });

  it("requires a director to appear at least twice before crowning them", () => {
    const rated = [
      makeRated({ directorId: "d1", directorName: "Solo Director" }),
      makeRated({ directorId: "d2", directorName: "Repeat Director" }),
      makeRated({ directorId: "d2", directorName: "Repeat Director" }),
      makeRated({ directorId: null, directorName: null }),
    ];
    const result = computeWrapped(rated, 2026)!;
    expect(result.topDirector?.id).toBe("d2");
    expect(result.topDirector?.count).toBe(2);
  });

  it("omits topDirector when nobody clears the two-appearance bar", () => {
    const rated = [
      makeRated({ directorId: "d1", directorName: "A" }),
      makeRated({ directorId: "d2", directorName: "B" }),
      makeRated({ directorId: "d3", directorName: "C" }),
      makeRated({ directorId: "d4", directorName: "D" }),
    ];
    expect(computeWrapped(rated, 2026)!.topDirector).toBeNull();
  });

  it("picks the highest-scored title as the favorite", () => {
    const rated = [
      makeRated({ titleId: "a", titleName: "A", score: 3 }),
      makeRated({ titleId: "b", titleName: "B", score: 5 }),
      makeRated({ titleId: "c", titleName: "C", score: 4 }),
      makeRated({ titleId: "d", titleName: "D", score: 2 }),
    ];
    const result = computeWrapped(rated, 2026)!;
    expect(result.favoriteTitle?.id).toBe("b");
  });

  it("picks the highly-rated title with the lowest vote count as the hidden gem", () => {
    const rated = [
      makeRated({ titleId: "big", titleName: "Blockbuster", score: 5, tmdbVoteCount: 50000 }),
      makeRated({ titleId: "small", titleName: "Obscure Gem", score: 4.5, tmdbVoteCount: 120 }),
      makeRated({ titleId: "bad", titleName: "Disliked Obscure", score: 1, tmdbVoteCount: 10 }),
      makeRated({ titleId: "mid", titleName: "Mid", score: 3, tmdbVoteCount: 5 }),
    ];
    const result = computeWrapped(rated, 2026)!;
    expect(result.hiddenGem?.id).toBe("small");
  });

  it("doesn't consider a title with no vote-count data for the hidden gem", () => {
    const rated = [
      makeRated({ titleId: "a", score: 5, tmdbVoteCount: null }),
      makeRated({ titleId: "b", score: 5, tmdbVoteCount: 500 }),
      makeRated({ titleId: "c", score: 4.5, tmdbVoteCount: 100 }),
      makeRated({ titleId: "d", score: 2, tmdbVoteCount: 1 }),
    ];
    const result = computeWrapped(rated, 2026)!;
    expect(result.hiddenGem?.id).toBe("c");
  });

  it("surfaces the top archetype when there's a real signal", () => {
    const rated = [
      makeRated({ genres: ["Crime", "Thriller"], tone: ["noir", "cynical"], weight: 2.5 }),
      makeRated({ genres: ["Crime", "Mystery"], tone: ["shadow", "hardboiled"], weight: 2 }),
      makeRated({ genres: ["Thriller"], tone: ["morally gray"], weight: 1.5 }),
      makeRated({ genres: ["Thriller"], tone: ["detective"], weight: 1.5 }),
    ];
    const result = computeWrapped(rated, 2026)!;
    expect(result.topArchetype?.name).toBe("Neo-Noir");
  });

  it("includes the year and a non-empty summary line", () => {
    const rated = Array.from({ length: 5 }, () => makeRated());
    const result = computeWrapped(rated, 2025)!;
    expect(result.year).toBe(2025);
    expect(result.summary).toContain("2025");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("uses a custom summary label when passed one, instead of the year", () => {
    const rated = Array.from({ length: 5 }, () => makeRated());
    const result = computeWrapped(rated, 2026, "July 2026")!;
    expect(result.summary).toContain("Your July 2026:");
    expect(result.summary).not.toContain("Your 2026:");
    // The numeric year field is untouched -- only the summary text label changes.
    expect(result.year).toBe(2026);
  });
});

describe("getMonthRange", () => {
  it("returns UTC month bounds and a human label for a mid-month date", () => {
    const { start, end, label } = getMonthRange(new Date(Date.UTC(2026, 6, 15, 12, 0, 0)));
    expect(start).toBe("2026-07-01T00:00:00.000Z");
    expect(end).toBe("2026-08-01T00:00:00.000Z");
    expect(label).toBe("July 2026");
  });

  it("rolls over into the next year for a December date", () => {
    const { start, end, label } = getMonthRange(new Date(Date.UTC(2026, 11, 31, 23, 59, 0)));
    expect(start).toBe("2026-12-01T00:00:00.000Z");
    expect(end).toBe("2027-01-01T00:00:00.000Z");
    expect(label).toBe("December 2026");
  });
});
