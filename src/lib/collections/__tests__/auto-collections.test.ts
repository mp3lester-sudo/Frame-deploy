import { describe, expect, it } from "vitest";
import { buildAutoCollections, type RatedTitleForCollections } from "../auto-collections";

const title = (overrides: Partial<RatedTitleForCollections>): RatedTitleForCollections => ({
  id: "t",
  name: "Title",
  posterUrl: null,
  score: 5,
  genres: ["Horror"],
  ratedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("buildAutoCollections", () => {
  it("returns no collections for an empty rating history", () => {
    expect(buildAutoCollections([])).toEqual([]);
  });

  it("does not build a collection for a genre rated only once or twice (below MIN_OCCURRENCES)", () => {
    const ratings = [title({ id: "1", genres: ["Horror"], score: 5 })];
    expect(buildAutoCollections(ratings)).toEqual([]);
  });

  it("does not build a collection for a genre the person doesn't clearly like", () => {
    const ratings = [
      title({ id: "1", genres: ["Drama"], score: 3 }),
      title({ id: "2", genres: ["Drama"], score: 2.5 }),
      title({ id: "3", genres: ["Drama"], score: 3 }),
    ];
    expect(buildAutoCollections(ratings)).toEqual([]);
  });

  it("builds a collection for a genre with real evidenced affinity", () => {
    const ratings = [
      title({ id: "1", genres: ["Horror"], score: 5 }),
      title({ id: "2", genres: ["Horror"], score: 4.5 }),
      title({ id: "3", genres: ["Horror"], score: 5 }),
    ];
    const result = buildAutoCollections(ratings);
    expect(result).toHaveLength(1);
    expect(result[0].genre).toBe("Horror");
    expect(result[0].titles.map((t) => t.id)).toEqual(["1", "3", "2"]); // sorted by score desc
  });

  it("excludes low-scored titles from an otherwise-qualifying genre's shelf", () => {
    const ratings = [
      title({ id: "1", genres: ["Horror"], score: 5 }),
      title({ id: "2", genres: ["Horror"], score: 4.5 }),
      title({ id: "3", genres: ["Horror"], score: 5 }),
      title({ id: "4", genres: ["Horror"], score: 2 }), // qualifies the genre's affinity math but too low itself
    ];
    const result = buildAutoCollections(ratings);
    expect(result[0].titles.map((t) => t.id)).not.toContain("4");
  });

  it("drops a genre whose qualifying titles fall below the 3-title minimum shelf size", () => {
    const ratings = [
      title({ id: "1", genres: ["Horror"], score: 5 }),
      title({ id: "2", genres: ["Horror"], score: 4.5 }),
      title({ id: "3", genres: ["Horror"], score: 2 }), // brings affinity math count to 3 but this one is too low-scored
    ];
    expect(buildAutoCollections(ratings)).toEqual([]);
  });

  it("caps at 3 collections, strongest affinity first", () => {
    const genres = ["Horror", "Comedy", "Drama", "Sci-Fi"];
    const ratings: RatedTitleForCollections[] = [];
    genres.forEach((genre, i) => {
      // Give each genre a slightly different affinity by varying score
      const score = 5 - i * 0.1;
      for (let j = 0; j < 3; j++) {
        ratings.push(title({ id: `${genre}-${j}`, genres: [genre], score }));
      }
    });
    const result = buildAutoCollections(ratings);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.genre)).toEqual(["Horror", "Comedy", "Drama"]);
  });

  it("caps each collection at 8 titles", () => {
    const ratings = Array.from({ length: 12 }, (_, i) => title({ id: `t${i}`, genres: ["Horror"], score: 5 }));
    const result = buildAutoCollections(ratings);
    expect(result[0].titles).toHaveLength(8);
  });
});
