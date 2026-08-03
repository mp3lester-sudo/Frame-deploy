import { describe, expect, it } from "vitest";
import { computeCinemaPoints, tierForPoints, CINEMA_TIER_THRESHOLDS } from "../cinema-score";

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
