import { describe, it, expect } from "vitest";
import { computeGenreAffinity, genreAffinityMultiplier, genreAffinityNote, type GenreAffinityEntry } from "@/lib/recommendations/genre-affinity";

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
    expect(affinity.get("Horror")!.affinity).toBeLessThan(-0.5);
    expect(affinity.get("Horror")!.count).toBe(3);
  });

  it("is strongly positive for a genre consistently rated high", () => {
    const affinity = computeGenreAffinity([
      { score: 5, genres: ["Drama"] },
      { score: 4.5, genres: ["Drama"] },
    ]);
    expect(affinity.get("Drama")!.affinity).toBeGreaterThan(0.5);
    expect(affinity.get("Drama")!.count).toBe(2);
  });

  it("nets out a mixed genre close to zero", () => {
    const affinity = computeGenreAffinity([
      { score: 5, genres: ["Comedy"] },
      { score: 0.5, genres: ["Comedy"] },
    ]);
    // (5 -> +1) averaged with (0.5 -> -0.8) is +0.1 — nowhere near the
    // strongly-negative/positive results above, which is the actual point.
    expect(Math.abs(affinity.get("Comedy")!.affinity)).toBeLessThan(0.15);
  });

  it("credits a title's rating to every genre it has", () => {
    const affinity = computeGenreAffinity([
      { score: 5, genres: ["Drama", "Crime"] },
      { score: 4.5, genres: ["Drama"] },
      { score: 4.8, genres: ["Crime"] },
    ]);
    expect(affinity.get("Drama")!.affinity).toBeGreaterThan(0.5);
    expect(affinity.get("Crime")!.affinity).toBeGreaterThan(0.5);
  });

  it("ignores titles with no genres", () => {
    const affinity = computeGenreAffinity([{ score: 5, genres: null }]);
    expect(affinity.size).toBe(0);
  });

  it("tracks a higher count for a genre seen more often, feeding confidence", () => {
    const ratings = Array.from({ length: 12 }, () => ({ score: 5, genres: ["Drama"] }));
    const affinity = computeGenreAffinity(ratings);
    expect(affinity.get("Drama")!.count).toBe(12);
  });
});

function entry(affinity: number, count: number): GenreAffinityEntry {
  return { affinity, count };
}

describe("genreAffinityMultiplier", () => {
  it("returns 1 (neutral) when the genre is unknown", () => {
    const affinity = new Map<string, GenreAffinityEntry>();
    expect(genreAffinityMultiplier(["Horror"], affinity)).toBe(1);
  });

  it("returns 1 when the candidate has no genres", () => {
    const affinity = new Map([["Horror", entry(-1, 10)]]);
    expect(genreAffinityMultiplier(null, affinity)).toBe(1);
  });

  it("applies only a light swing at the minimum occurrence count (low confidence)", () => {
    const affinity = new Map([["Horror", entry(-1, 2)]]);
    const mult = genreAffinityMultiplier(["Horror"], affinity);
    expect(mult).toBeCloseTo(0.88, 5); // 1 + (-1 * 0.12)
  });

  it("applies the full swing once a genre has enough occurrences (high confidence)", () => {
    const affinity = new Map([["Horror", entry(-1, 10)]]);
    const mult = genreAffinityMultiplier(["Horror"], affinity);
    expect(mult).toBeCloseTo(0.7, 5); // 1 + (-1 * 0.3)
  });

  it("boosts a candidate whose genre the user loves with high confidence", () => {
    const affinity = new Map([["Drama", entry(1, 10)]]);
    const mult = genreAffinityMultiplier(["Drama"], affinity);
    expect(mult).toBeCloseTo(1.3, 5);
  });

  it("scales the swing between the min and max bounds for in-between confidence", () => {
    const affinity = new Map([["Drama", entry(1, 6)]]);
    // count 6 of 2..10 range is 50% confidence -> swing halfway between 0.12 and 0.3 = 0.21
    const mult = genreAffinityMultiplier(["Drama"], affinity);
    expect(mult).toBeCloseTo(1.21, 5);
  });

  it("averages across known genres and skips unknown ones", () => {
    const affinity = new Map([["Drama", entry(1, 10)]]);
    // "Crime" has no data — should be skipped, not treated as 0, so the
    // average is just Drama's own affinity, not diluted by an assumed-0.
    const mult = genreAffinityMultiplier(["Drama", "Crime"], affinity);
    expect(mult).toBeCloseTo(1.3, 5);
  });

  it("clamps combined affinity to +/-1 worth of swing across multiple confident genres", () => {
    const affinity = new Map([
      ["Horror", entry(-1, 10)],
      ["Slasher", entry(-1, 10)],
    ]);
    const mult = genreAffinityMultiplier(["Horror", "Slasher"], affinity);
    expect(mult).toBeCloseTo(0.7, 5);
  });
});


describe("genreAffinityNote", () => {
  const entry = (affinity: number, count: number): GenreAffinityEntry => ({ affinity, count });

  it("returns null when no genre clears the note threshold", () => {
    const affinity = new Map([["Drama", entry(0.2, 10)]]);
    expect(genreAffinityNote(["Drama"], affinity)).toBeNull();
  });

  it("returns null for a title with no known genres", () => {
    const affinity = new Map([["Drama", entry(0.8, 10)]]);
    expect(genreAffinityNote(null, affinity)).toBeNull();
    expect(genreAffinityNote(["Crime"], affinity)).toBeNull();
  });

  it("names the genre once affinity clears the threshold", () => {
    const affinity = new Map([["Drama", entry(0.6, 10)]]);
    expect(genreAffinityNote(["Drama"], affinity)).toBe("you consistently rate Drama highly");
  });

  it("picks the single strongest-affinity genre among several qualifying ones", () => {
    const affinity = new Map([
      ["Drama", entry(0.5, 10)],
      ["Crime", entry(0.9, 10)],
    ]);
    expect(genreAffinityNote(["Drama", "Crime"], affinity)).toBe("you consistently rate Crime highly");
  });

  it("never names a genre with negative affinity", () => {
    const affinity = new Map([["Horror", entry(-0.9, 10)]]);
    expect(genreAffinityNote(["Horror"], affinity)).toBeNull();
  });
});
