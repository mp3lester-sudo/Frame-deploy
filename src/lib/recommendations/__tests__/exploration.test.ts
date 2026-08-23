import { describe, it, expect } from "vitest";
import {
  computeDominantGenres,
  pickExplorationCandidate,
  type ExplorationCandidate,
} from "@/lib/recommendations/exploration";

describe("computeDominantGenres", () => {
  it("returns an empty set for a user with no rated-genre data at all", () => {
    expect(computeDominantGenres([]).size).toBe(0);
    expect(computeDominantGenres([null, null]).size).toBe(0);
  });

  it("treats a genre appearing in most ratings as dominant", () => {
    const dominant = computeDominantGenres([["Drama"], ["Drama"], ["Drama"], ["Comedy"]]);
    expect(dominant.has("Drama")).toBe(true);
  });

  it("does not treat a rarely-rated genre as dominant", () => {
    // Comedy is 1 of 20 genre-tag mentions (5%), well under the 15% bar.
    const ratedGenreLists: (string[] | null)[] = Array.from({ length: 19 }, () => ["Drama"]);
    ratedGenreLists.push(["Comedy"]);
    const dominant = computeDominantGenres(ratedGenreLists);
    expect(dominant.has("Drama")).toBe(true);
    expect(dominant.has("Comedy")).toBe(false);
  });

  it("can surface more than one dominant genre", () => {
    const dominant = computeDominantGenres([["Drama"], ["Thriller"], ["Drama"], ["Thriller"]]);
    expect(dominant.has("Drama")).toBe(true);
    expect(dominant.has("Thriller")).toBe(true);
  });
});

describe("pickExplorationCandidate", () => {
  const candidates: ExplorationCandidate[] = [
    { id: "a", score: 0.9, genres: ["Drama"] }, // overlaps usual taste -- not eligible
    { id: "b", score: 0.7, genres: ["Comedy"] }, // genuinely different, lower score
    { id: "c", score: 0.6, genres: ["Comedy", "Romance"] }, // also different, lower score than b
    { id: "d", score: 0.5, genres: null }, // no genre data -- can't confirm it's different
  ];

  it("returns null when the user has no dominant genres yet (too new to diverge from)", () => {
    const result = pickExplorationCandidate(candidates, new Set(), new Set());
    expect(result).toBeNull();
  });

  it("picks the best-scoring candidate that shares none of the dominant genres", () => {
    const result = pickExplorationCandidate(candidates, new Set(["Drama"]), new Set());
    expect(result?.id).toBe("b");
  });

  it("skips candidates with no genre data", () => {
    const onlyUnknown: ExplorationCandidate[] = [{ id: "x", score: 1, genres: null }];
    expect(pickExplorationCandidate(onlyUnknown, new Set(["Drama"]), new Set())).toBeNull();
  });

  it("excludes candidates already on the main slate", () => {
    const result = pickExplorationCandidate(candidates, new Set(["Drama"]), new Set(["b"]));
    expect(result?.id).toBe("c");
  });

  it("returns null when every genre-tagged candidate overlaps the user's usual taste", () => {
    const allDrama: ExplorationCandidate[] = [
      { id: "a", score: 0.9, genres: ["Drama"] },
      { id: "b", score: 0.8, genres: ["Drama", "Thriller"] },
    ];
    expect(pickExplorationCandidate(allDrama, new Set(["Drama"]), new Set())).toBeNull();
  });

  it("rejects a candidate with even partial overlap, not just an exact genre match", () => {
    // "Drama" is dominant; a Drama/Comedy candidate still overlaps and should be rejected.
    const mixed: ExplorationCandidate[] = [{ id: "a", score: 1, genres: ["Drama", "Comedy"] }];
    expect(pickExplorationCandidate(mixed, new Set(["Drama"]), new Set())).toBeNull();
  });
});
