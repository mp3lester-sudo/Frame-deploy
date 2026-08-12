import { describe, it, expect } from "vitest";
import { diversifyRecommendations, type DiversifiableCandidate } from "../diversify";

function c(id: string, score: number, genres: string[] | null, directorId?: string | null): DiversifiableCandidate {
  return { id, score, genres, directorId };
}

describe("diversifyRecommendations", () => {
  it("returns an empty list for empty input", () => {
    expect(diversifyRecommendations([], 5)).toEqual([]);
  });

  it("returns everything unchanged when nothing overlaps and pool <= limit", () => {
    const candidates = [c("a", 0.9, ["Drama"]), c("b", 0.8, ["Comedy"]), c("c", 0.7, ["Horror"])];
    expect(diversifyRecommendations(candidates, 5).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("preserves score order when no genre overlap exceeds the threshold", () => {
    const candidates = [
      c("a", 0.95, ["Drama", "Crime"]),
      c("b", 0.9, ["Comedy"]),
      c("c", 0.85, ["Horror", "Thriller"]),
      c("d", 0.8, ["Animation"]),
    ];
    expect(diversifyRecommendations(candidates, 4).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("skips a candidate whose genres are near-identical to an already-picked higher-score one", () => {
    // b and a are genre-identical (Jaccard 1.0) -- b should be skipped in
    // favor of c, then included later only once the slot forces it.
    const candidates = [
      c("a", 0.95, ["Drama", "Crime"]),
      c("b", 0.9, ["Drama", "Crime"]),
      c("c", 0.85, ["Comedy"]),
    ];
    const result = diversifyRecommendations(candidates, 2);
    expect(result.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("falls back to the next-best remaining candidate when everything left is too similar", () => {
    // Only one genre exists across the whole pool -- diversity can't help,
    // so it should degrade to plain score order rather than returning fewer
    // than `limit` results.
    const candidates = [c("a", 0.9, ["Drama"]), c("b", 0.8, ["Drama"]), c("c", 0.7, ["Drama"])];
    expect(diversifyRecommendations(candidates, 3).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("treats null/empty genres as never similar to anything", () => {
    const candidates = [c("a", 0.9, null), c("b", 0.85, []), c("c", 0.8, null)];
    expect(diversifyRecommendations(candidates, 3).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("respects a limit smaller than the candidate pool", () => {
    const candidates = [c("a", 0.9, ["Drama"]), c("b", 0.8, ["Comedy"]), c("c", 0.7, ["Horror"])];
    expect(diversifyRecommendations(candidates, 2).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("a title sharing exactly half its combined genre set is not treated as over the threshold", () => {
    // a: [Drama, Crime, Action] (3), b: [Drama] (1) -- intersection 1, union 3
    // -> Jaccard 1/3, well under 0.5, so both should be selectable.
    const candidates = [c("a", 0.9, ["Drama", "Crime", "Action"]), c("b", 0.8, ["Drama"])];
    expect(diversifyRecommendations(candidates, 2).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("skips a same-director candidate even when genres don't overlap at all", () => {
    // a and b share a director but have completely disjoint genres --
    // genre Jaccard alone would let both through; the director check
    // should still catch it and prefer c instead.
    const candidates = [
      c("a", 0.95, ["Drama"], "director-1"),
      c("b", 0.9, ["Sci-Fi"], "director-1"),
      c("c", 0.85, ["Comedy"], "director-2"),
    ];
    expect(diversifyRecommendations(candidates, 2).map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("treats unknown (null/undefined) director as never similar to anything", () => {
    const candidates = [c("a", 0.9, ["Drama"], null), c("b", 0.85, ["Sci-Fi"], undefined), c("c", 0.8, ["Comedy"], null)];
    expect(diversifyRecommendations(candidates, 3).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("falls back to score order when director-clustering leaves nothing eligible", () => {
    // All three share a director, genres are all distinct -- diversity by
    // director can't help here, so it should degrade to score order.
    const candidates = [
      c("a", 0.9, ["Drama"], "director-1"),
      c("b", 0.8, ["Sci-Fi"], "director-1"),
      c("c", 0.7, ["Comedy"], "director-1"),
    ];
    expect(diversifyRecommendations(candidates, 3).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
