import { describe, expect, it } from "vitest";
import { calibrateMatchPercents } from "../match-percent";

describe("calibrateMatchPercents", () => {
  it("returns an empty array for no candidates", () => {
    expect(calibrateMatchPercents([])).toEqual([]);
  });

  it("gives a single candidate a flat high-confidence value rather than the ceiling", () => {
    expect(calibrateMatchPercents([0.42])).toEqual([88]);
  });

  it("maps the best and worst of a ranked set to the ceiling and floor", () => {
    const result = calibrateMatchPercents([0.9, 0.6, 0.3]);
    expect(result[0]).toBe(98);
    expect(result[2]).toBe(75);
  });

  it("preserves ranking order — a higher raw score never shows a lower percent", () => {
    const scores = [0.95, 0.8, 0.7, 0.5, 0.1];
    const result = calibrateMatchPercents(scores);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeLessThanOrEqual(result[i - 1]);
    }
  });

  it("every result stays within the 75-98 band", () => {
    const result = calibrateMatchPercents([0.99, 0.5, 0.4, 0.35, 0.01]);
    for (const pct of result) {
      expect(pct).toBeGreaterThanOrEqual(75);
      expect(pct).toBeLessThanOrEqual(98);
    }
  });

  it("falls back to a flat value when all scores are identical (no spread to normalize)", () => {
    expect(calibrateMatchPercents([0.5, 0.5, 0.5])).toEqual([88, 88, 88]);
  });
});
