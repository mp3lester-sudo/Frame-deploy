import { describe, it, expect } from "vitest";
import {
  getDecade,
  formatDecadeLabel,
  computeDecadeAffinity,
  decadeAffinityMultiplier,
  decadeAffinityNote,
} from "@/lib/recommendations/decade-affinity";

describe("getDecade", () => {
  it("buckets a release date into its decade", () => {
    expect(getDecade("1999-05-21")).toBe(1990);
    expect(getDecade("2003-01-01")).toBe(2000);
    expect(getDecade("2024-12-31")).toBe(2020);
  });

  it("returns null for missing or unparseable dates", () => {
    expect(getDecade(null)).toBeNull();
    expect(getDecade(undefined)).toBeNull();
    expect(getDecade("not-a-date")).toBeNull();
  });
});

describe("formatDecadeLabel", () => {
  it("formats a decade as a label", () => {
    expect(formatDecadeLabel(1990)).toBe("1990s");
    expect(formatDecadeLabel(2020)).toBe("2020s");
  });
});

describe("computeDecadeAffinity", () => {
  it("returns an empty map with no ratings", () => {
    expect(computeDecadeAffinity([]).size).toBe(0);
  });

  it("omits a decade below the occurrence threshold", () => {
    // Only 2 ratings for the 1990s -- below MIN_OCCURRENCES (3).
    const affinity = computeDecadeAffinity([
      { score: 5, releaseDate: "1995-01-01" },
      { score: 5, releaseDate: "1997-01-01" },
    ]);
    expect(affinity.has(1990)).toBe(false);
  });

  it("computes positive affinity once enough evidence exists", () => {
    const affinity = computeDecadeAffinity([
      { score: 5, releaseDate: "1995-01-01" },
      { score: 5, releaseDate: "1996-01-01" },
      { score: 4.5, releaseDate: "1997-01-01" },
    ]);
    const entry = affinity.get(1990);
    expect(entry).toBeDefined();
    expect(entry!.affinity).toBeGreaterThan(0);
    expect(entry!.count).toBe(3);
  });

  it("computes negative affinity for a consistently low-rated decade", () => {
    const affinity = computeDecadeAffinity([
      { score: 1, releaseDate: "2015-01-01" },
      { score: 0.5, releaseDate: "2016-01-01" },
      { score: 1, releaseDate: "2017-01-01" },
    ]);
    expect(affinity.get(2010)!.affinity).toBeLessThan(0);
  });

  it("ignores ratings with no parseable release date", () => {
    const affinity = computeDecadeAffinity([
      { score: 5, releaseDate: null },
      { score: 5, releaseDate: "bad-date" },
    ]);
    expect(affinity.size).toBe(0);
  });
});

describe("decadeAffinityMultiplier", () => {
  it("returns 1 (no opinion) for an unknown candidate decade", () => {
    const affinity = computeDecadeAffinity([
      { score: 5, releaseDate: "1995-01-01" },
      { score: 5, releaseDate: "1996-01-01" },
      { score: 5, releaseDate: "1997-01-01" },
    ]);
    expect(decadeAffinityMultiplier(null, affinity)).toBe(1);
    expect(decadeAffinityMultiplier("2020-01-01", affinity)).toBe(1);
  });

  it("boosts a candidate from a favored decade, capped well under genre's ceiling", () => {
    const affinity = computeDecadeAffinity(
      Array.from({ length: 12 }, () => ({ score: 5, releaseDate: "1995-01-01" }))
    );
    const mult = decadeAffinityMultiplier("1998-01-01", affinity);
    expect(mult).toBeGreaterThan(1);
    // "Don't be too strict" -- max swing must stay light, well under
    // genre-affinity's 0.3 ceiling.
    expect(mult).toBeLessThanOrEqual(1.12);
  });

  it("penalizes a candidate from a disfavored decade, staying light-touch", () => {
    const affinity = computeDecadeAffinity(
      Array.from({ length: 12 }, () => ({ score: 0.5, releaseDate: "2015-01-01" }))
    );
    const mult = decadeAffinityMultiplier("2018-01-01", affinity);
    expect(mult).toBeLessThan(1);
    expect(mult).toBeGreaterThanOrEqual(0.88);
  });

  it("never excludes -- always returns a positive multiplier even at max negative affinity", () => {
    const affinity = computeDecadeAffinity(
      Array.from({ length: 20 }, () => ({ score: 0.5, releaseDate: "2015-01-01" }))
    );
    expect(decadeAffinityMultiplier("2015-06-01", affinity)).toBeGreaterThan(0);
  });
});

describe("decadeAffinityNote", () => {
  it("returns null when the candidate's decade has no evidenced affinity", () => {
    const affinity = computeDecadeAffinity([
      { score: 5, releaseDate: "1995-01-01" },
      { score: 5, releaseDate: "1996-01-01" },
      { score: 5, releaseDate: "1997-01-01" },
    ]);
    expect(decadeAffinityNote("2020-01-01", affinity)).toBeNull();
  });

  it("returns null for a mild affinity that doesn't clear the note threshold", () => {
    // Mixed ratings around the midpoint keep affinity low/positive but
    // under NOTE_AFFINITY_THRESHOLD (0.3).
    const affinity = computeDecadeAffinity([
      { score: 3, releaseDate: "1995-01-01" },
      { score: 2.5, releaseDate: "1996-01-01" },
      { score: 3, releaseDate: "1997-01-01" },
    ]);
    expect(decadeAffinityNote("1998-01-01", affinity)).toBeNull();
  });

  it("returns a real, specific note once affinity clearly favors the decade", () => {
    const affinity = computeDecadeAffinity([
      { score: 5, releaseDate: "1995-01-01" },
      { score: 5, releaseDate: "1996-01-01" },
      { score: 5, releaseDate: "1997-01-01" },
    ]);
    const note = decadeAffinityNote("1999-01-01", affinity);
    expect(note).toBe("you tend to love films from the 1990s");
  });

  it("never claims a decade preference for a negative affinity", () => {
    const affinity = computeDecadeAffinity([
      { score: 0.5, releaseDate: "2015-01-01" },
      { score: 0.5, releaseDate: "2016-01-01" },
      { score: 1, releaseDate: "2017-01-01" },
    ]);
    expect(decadeAffinityNote("2018-01-01", affinity)).toBeNull();
  });
});
