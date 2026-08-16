import { describe, expect, it } from "vitest";
import { computeCinemaPoints, tierForPoints, letterGradeForPoints, CINEMA_TIER_THRESHOLDS } from "../cinema-score";

describe("computeCinemaPoints", () => {
  it("gives 0 for no activity", () => {
    expect(computeCinemaPoints(0, 0)).toBe(0);
  });

  it("gives 50 per watched title", () => {
    expect(computeCinemaPoints(10, 0)).toBe(500);
  });

  it("gives 100 total for a watched+reviewed title (50 base + 50 bonus)", () => {
    expect(computeCinemaPoints(1, 1)).toBe(100);
  });

  it("mixes watched-only and watched+reviewed titles correctly", () => {
    // 10 watched total, 4 of which are also reviewed:
    // 10*50 (base for all watched) + 4*50 (bonus for the reviewed ones) = 700
    expect(computeCinemaPoints(10, 4)).toBe(700);
  });

  it("clamps negative inputs to zero instead of producing negative points", () => {
    expect(computeCinemaPoints(-5, -2)).toBe(0);
  });

  it("never lets reviewedCount alone produce more than watchedCount would allow for realistic inputs", () => {
    // Not a hard invariant enforced by the function (it trusts its inputs),
    // but sanity-check the formula stays additive and predictable.
    expect(computeCinemaPoints(5, 5)).toBe(5 * 50 + 5 * 50);
  });
});

describe("tierForPoints", () => {
  it("is rookie at zero", () => {
    expect(tierForPoints(0)).toBe("rookie");
  });

  it("is rookie just below the intermediate threshold", () => {
    expect(tierForPoints(CINEMA_TIER_THRESHOLDS.intermediate - 1)).toBe("rookie");
  });

  it("is intermediate exactly at the intermediate threshold", () => {
    expect(tierForPoints(CINEMA_TIER_THRESHOLDS.intermediate)).toBe("intermediate");
  });

  it("is intermediate just below the pro threshold", () => {
    expect(tierForPoints(CINEMA_TIER_THRESHOLDS.pro - 1)).toBe("intermediate");
  });

  it("is pro exactly at the pro threshold", () => {
    expect(tierForPoints(CINEMA_TIER_THRESHOLDS.pro)).toBe("pro");
  });

  it("is pro well above the pro threshold", () => {
    expect(tierForPoints(CINEMA_TIER_THRESHOLDS.pro * 10)).toBe("pro");
  });
});

describe("letterGradeForPoints", () => {
  it("is F at zero", () => {
    expect(letterGradeForPoints(0)).toBe("F");
  });

  it("clamps negative points to F instead of throwing or going out of range", () => {
    expect(letterGradeForPoints(-500)).toBe("F");
  });

  it("steps up exactly at each threshold, not one point early", () => {
    expect(letterGradeForPoints(149)).toBe("F");
    expect(letterGradeForPoints(150)).toBe("D");
    expect(letterGradeForPoints(399)).toBe("D");
    expect(letterGradeForPoints(400)).toBe("C-");
  });

  it("agrees with the intermediate tier boundary (C+ at 1000)", () => {
    expect(letterGradeForPoints(CINEMA_TIER_THRESHOLDS.intermediate - 1)).toBe("C");
    expect(letterGradeForPoints(CINEMA_TIER_THRESHOLDS.intermediate)).toBe("C+");
    expect(tierForPoints(CINEMA_TIER_THRESHOLDS.intermediate)).toBe("intermediate");
  });

  it("agrees with the pro tier boundary (A at 5000)", () => {
    expect(letterGradeForPoints(CINEMA_TIER_THRESHOLDS.pro - 1)).toBe("A-");
    expect(letterGradeForPoints(CINEMA_TIER_THRESHOLDS.pro)).toBe("A");
    expect(tierForPoints(CINEMA_TIER_THRESHOLDS.pro)).toBe("pro");
  });

  it("tops out at A+ and never returns anything past it for huge point totals", () => {
    expect(letterGradeForPoints(7500)).toBe("A+");
    expect(letterGradeForPoints(1_000_000)).toBe("A+");
  });

  it("matches the real Jackson-Marley-style case: 239 watched, 0 reviewed", () => {
    const points = computeCinemaPoints(239, 0);
    expect(points).toBe(11950);
    expect(letterGradeForPoints(points)).toBe("A+");
  });
});
