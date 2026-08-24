import { describe, expect, it } from "vitest";
import { intersectMutualFollows, pickBestTasteTwin, type TasteTwinCandidate } from "../taste-twin";

describe("intersectMutualFollows", () => {
  it("returns only ids present in both lists", () => {
    expect(intersectMutualFollows(["a", "b", "c"], ["b", "c", "d"])).toEqual(["b", "c"]);
  });

  it("returns empty when there's no overlap", () => {
    expect(intersectMutualFollows(["a", "b"], ["c", "d"])).toEqual([]);
  });

  it("returns empty when either list is empty", () => {
    expect(intersectMutualFollows([], ["a"])).toEqual([]);
    expect(intersectMutualFollows(["a"], [])).toEqual([]);
  });

  it("de-duplicates the following list", () => {
    expect(intersectMutualFollows(["a", "a", "b"], ["a"])).toEqual(["a"]);
  });
});

describe("pickBestTasteTwin", () => {
  const candidate = (overrides: Partial<TasteTwinCandidate>): TasteTwinCandidate => ({
    id: "user",
    percent: 90,
    hasEnoughData: true,
    sharedFavoriteGenres: [],
    ...overrides,
  });

  it("returns null for an empty candidate list", () => {
    expect(pickBestTasteTwin([])).toBeNull();
  });

  it("excludes candidates below the threshold", () => {
    const candidates = [candidate({ id: "a", percent: 84 })];
    expect(pickBestTasteTwin(candidates)).toBeNull();
  });

  it("excludes candidates without enough shared rating data even at a high percent", () => {
    const candidates = [candidate({ id: "a", percent: 95, hasEnoughData: false })];
    expect(pickBestTasteTwin(candidates)).toBeNull();
  });

  it("picks the single candidate that clears both bars", () => {
    const candidates = [candidate({ id: "a", percent: 88 })];
    expect(pickBestTasteTwin(candidates)?.id).toBe("a");
  });

  it("picks the highest percent among multiple qualifying candidates", () => {
    const candidates = [
      candidate({ id: "a", percent: 86 }),
      candidate({ id: "b", percent: 97 }),
      candidate({ id: "c", percent: 91 }),
    ];
    expect(pickBestTasteTwin(candidates)?.id).toBe("b");
  });

  it("ignores a higher-percent candidate that lacks enough data in favor of a qualifying lower one", () => {
    const candidates = [
      candidate({ id: "a", percent: 99, hasEnoughData: false }),
      candidate({ id: "b", percent: 86 }),
    ];
    expect(pickBestTasteTwin(candidates)?.id).toBe("b");
  });

  it("respects a custom threshold", () => {
    const candidates = [candidate({ id: "a", percent: 80 })];
    expect(pickBestTasteTwin(candidates, 75)?.id).toBe("a");
    expect(pickBestTasteTwin(candidates, 85)).toBeNull();
  });
});
