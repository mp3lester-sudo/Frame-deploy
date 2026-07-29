import { describe, it, expect } from "vitest";
import { buildGenreAffinity, rankTeaserCandidates, buildTeaserWhy } from "@/lib/recommendations/teaser";

describe("buildGenreAffinity", () => {
  it("weighs a loved title's genres positively and a disliked title's negatively", () => {
    const swipes = [
      { titleId: "a", score: 5 }, // love it
      { titleId: "b", score: 1 }, // not for me
    ];
    const titles = [
      { id: "a", genres: ["Science Fiction", "Thriller"] },
      { id: "b", genres: ["Horror"] },
    ];
    const affinity = buildGenreAffinity(swipes, titles);
    expect(affinity.get("Science Fiction")).toBeGreaterThan(0);
    expect(affinity.get("Thriller")).toBeGreaterThan(0);
    expect(affinity.get("Horror")).toBeLessThan(0);
  });

  it("treats 'it's fine' (score 3) as neutral — no affinity contribution", () => {
    const swipes = [{ titleId: "a", score: 3 }];
    const titles = [{ id: "a", genres: ["Drama"] }];
    const affinity = buildGenreAffinity(swipes, titles);
    expect(affinity.has("Drama")).toBe(false);
  });

  it("accumulates affinity across multiple swipes sharing a genre", () => {
    const swipes = [
      { titleId: "a", score: 5 },
      { titleId: "b", score: 5 },
    ];
    const titles = [
      { id: "a", genres: ["Comedy"] },
      { id: "b", genres: ["Comedy"] },
    ];
    const affinity = buildGenreAffinity(swipes, titles);
    expect(affinity.get("Comedy")).toBe(4); // (5-3) + (5-3)
  });

  it("ignores swipes for titles not found in the swiped-titles lookup", () => {
    const affinity = buildGenreAffinity([{ titleId: "missing", score: 5 }], []);
    expect(affinity.size).toBe(0);
  });
});

describe("rankTeaserCandidates", () => {
  const affinity = new Map([
    ["Science Fiction", 4],
    ["Horror", -4],
  ]);

  it("excludes candidates with no positive genre overlap", () => {
    const candidates = [{ id: "x", genres: ["Romance"], weightedRating: 8 }];
    expect(rankTeaserCandidates(candidates, affinity)).toHaveLength(0);
  });

  it("excludes candidates whose only overlap is a disliked genre", () => {
    const candidates = [{ id: "x", genres: ["Horror"], weightedRating: 8 }];
    expect(rankTeaserCandidates(candidates, affinity)).toHaveLength(0);
  });

  it("ranks a liked-genre match above a lower-quality liked-genre match", () => {
    const candidates = [
      { id: "low-quality", genres: ["Science Fiction"], weightedRating: 5.0 },
      { id: "high-quality", genres: ["Science Fiction"], weightedRating: 8.5 },
    ];
    const ranked = rankTeaserCandidates(candidates, affinity);
    expect(ranked[0].id).toBe("high-quality");
  });

  it("returns matchedGenres containing only the positively-weighted genres", () => {
    // Net genre score must stay positive overall (Sci-Fi +4, Horror -4 would
    // cancel out and get excluded entirely) — bump the affinity so this
    // candidate specifically tests matchedGenres filtering, not the net-score
    // exclusion covered by the test above.
    const strongAffinity = new Map([
      ["Science Fiction", 6],
      ["Horror", -4],
    ]);
    const candidates = [{ id: "x", genres: ["Science Fiction", "Horror"], weightedRating: 7 }];
    const [result] = rankTeaserCandidates(candidates, strongAffinity);
    expect(result.matchedGenres).toEqual(["Science Fiction"]);
  });
});

describe("buildTeaserWhy", () => {
  it("mentions one genre when only one matched", () => {
    expect(buildTeaserWhy(["Science Fiction"])).toBe("Because you loved science fiction");
  });

  it("mentions two genres when two matched", () => {
    expect(buildTeaserWhy(["Science Fiction", "Thriller"])).toBe("Because you loved science fiction and thriller");
  });

  it("falls back to a generic line when no genres matched", () => {
    expect(buildTeaserWhy([])).toMatch(/best-reviewed/);
  });
});
