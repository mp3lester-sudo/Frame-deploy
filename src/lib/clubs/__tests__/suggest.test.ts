import { describe, expect, it } from "vitest";
import { topPositiveGenres, rankSuggestedClubs } from "../suggest";
import type { GenreAffinityEntry } from "@/lib/recommendations/genre-affinity";

function affinity(entries: [string, number, number?][]): Map<string, GenreAffinityEntry> {
  return new Map(entries.map(([genre, aff, count]) => [genre, { affinity: aff, count: count ?? 5 }]));
}

describe("topPositiveGenres", () => {
  it("returns an empty list for an empty map", () => {
    expect(topPositiveGenres(new Map())).toEqual([]);
  });

  it("excludes negative-affinity genres", () => {
    const result = topPositiveGenres(affinity([["Horror", -0.5]]));
    expect(result).toEqual([]);
  });

  it("orders by affinity, strongest first", () => {
    const result = topPositiveGenres(affinity([["Drama", 0.3], ["Sci-Fi", 0.8], ["Comedy", 0.5]]));
    expect(result).toEqual(["Sci-Fi", "Comedy", "Drama"]);
  });

  it("respects a custom count", () => {
    const result = topPositiveGenres(affinity([["Drama", 0.3], ["Sci-Fi", 0.8], ["Comedy", 0.5]]), 1);
    expect(result).toEqual(["Sci-Fi"]);
  });
});

describe("rankSuggestedClubs", () => {
  it("returns nothing when there are no candidate clubs", () => {
    expect(rankSuggestedClubs(["Horror"], [], 3)).toEqual([]);
  });

  it("drops clubs with zero genre overlap", () => {
    const result = rankSuggestedClubs(["Horror"], [{ id: "club-1", affinity: affinity([["Comedy", 0.6]]) }], 3);
    expect(result).toEqual([]);
  });

  it("ranks clubs by number of shared genres, most overlap first", () => {
    const result = rankSuggestedClubs(
      ["Horror", "Sci-Fi", "Drama"],
      [
        { id: "one-match", affinity: affinity([["Horror", 0.5]]) },
        { id: "two-match", affinity: affinity([["Horror", 0.5], ["Sci-Fi", 0.4]]) },
      ],
      3
    );
    expect(result.map((r) => r.id)).toEqual(["two-match", "one-match"]);
    expect(result[0].sharedGenres).toEqual(["Horror", "Sci-Fi"]);
  });

  it("ignores a club's negative affinity for a genre the viewer loves", () => {
    const result = rankSuggestedClubs(["Horror"], [{ id: "club-1", affinity: affinity([["Horror", -0.2]]) }], 3);
    expect(result).toEqual([]);
  });

  it("respects the limit", () => {
    const result = rankSuggestedClubs(
      ["Horror"],
      [
        { id: "a", affinity: affinity([["Horror", 0.9]]) },
        { id: "b", affinity: affinity([["Horror", 0.8]]) },
        { id: "c", affinity: affinity([["Horror", 0.7]]) },
      ],
      2
    );
    expect(result).toHaveLength(2);
  });
});
