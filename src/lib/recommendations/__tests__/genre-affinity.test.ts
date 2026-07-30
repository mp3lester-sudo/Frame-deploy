import { describe, it, expect } from "vitest";
import { computeGenreAffinity, genreAffinityMultiplier } from "@/lib/recommendations/genre-affinity";

describe("computeGenreAffinity", () => {
  it("returns nothing for genres seen fewer than 2 times", () => {
    const affinity = computeGenreAffinity([{ score: 0.5, genres: ["Horror"] }]);
    expect(affinity.has("Horror")).toBe(false);
  });

  it("is strongly negative for a genre consistently rated low", () => {
    const affinity = computeGenreAffinity([
      { score: 0.5, genres: ["Horror"] },
      { score: 1, genres: ["Horror"] },
      { score: 0.5, genres: ["Horror"] },
    ]);
    expect(affinity.get("Horror")).toBeLessThan(-0.5);
  });

  it("is strongly positive for a genre consistently rated high", () => {
    const affinity = computeGenreAffinity([
      { score: 5, genres: ["Drama"] },
      { score: 4.5, genres: ["Drama"] },
    ]);
    expect(affinity.get("Drama")).toBeGreaterThan(0.5);
  });

  it("nets out a mixed genre close to zero", () => {
    const affinity = computeGenreAffinity([
      { score: 5, genres: ["Comedy"] },
      { score: 0.5, genres: ["Comedy"] },
    ]);
    // (5 -> +1) averaged with (0.5 -> -0.8) is +0.1 — nowhere near the
    // strongly-negative/positive results above, which is the actual point.
    expect(Math.abs(affinity.get("Comedy")!)).toBeLessThan(0.15);
  });

  it("credits a title's rating to every genre it has", () => {
    const affinity = computeGenreAffinity([
      { score: 5, genres: ["Drama", "Crime"] },
      { score: 4.5, genres: ["Drama"] },
      { score: 4.8, genres: ["Crime"] },
    ]);
    expect(affinity.get("Drama")).toBeGreaterThan(0.5);
    expect(affinity.get("Crime")).toBeGreaterThan(0.5);
  });

  it("ignores titles with no genres", () => {
    const affinity = computeGenreAffinity([{ score: 5, genres: null }]);
    expect(affinity.size).toBe(0);
  });
});

describe("genreAffinityMultiplier", () => {
  it("returns 1 (neutral) when the genre is unknown", () => {
    const affinity = new Map<string, number>();
    expect(genreAffinityMultiplier(["Horror"], affinity)).toBe(1);
  });

  it("returns 1 when the candidate has no genres", () => {
    const affinity = new Map([["Horror", -1]]);
    expect(genreAffinityMultiplier(null, affinity)).toBe(1);
  });

  it("penalizes a candidate whose genre the user hates", () => {
    const affinity = new Map([["Horror", -1]]);
    const mult = genreAffinityMultiplier(["Horror"], affinity);
    expect(mult).toBeCloseTo(0.7, 5);
  });

  it("boosts a candidate whose genre the user loves", () => {
    const affinity = new Map([["Drama", 1]]);
    const mult = genreAffinityMultiplier(["Drama"], affinity);
    expect(mult).toBeCloseTo(1.3, 5);
  });

  it("averages across known genres and skips unknown ones", () => {
    const affinity = new Map([["Drama", 1]]);
    // "Crime" has no data — should be skipped, not treated as 0, so the
    // average is just Drama's own affinity, not diluted by an assumed-0.
    const mult = genreAffinityMultiplier(["Drama", "Crime"], affinity);
    expect(mult).toBeCloseTo(1.3, 5);
  });

  it("clamps combined affinity to +/-1 before applying the swing", () => {
    const affinity = new Map([["Horror", -1], ["Slasher", -1]]);
    const mult = genreAffinityMultiplier(["Horror", "Slasher"], affinity);
    expect(mult).toBeCloseTo(0.7, 5);
  });
});
