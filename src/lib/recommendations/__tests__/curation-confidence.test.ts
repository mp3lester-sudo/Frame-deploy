import { describe, it, expect } from "vitest";
import { computeCurationConfidence, computeAdjustmentBand } from "@/lib/recommendations/curation-confidence";

describe("computeCurationConfidence", () => {
  it("is 0 for a brand new account with no high ratings", () => {
    expect(computeCurationConfidence(0)).toBe(0);
  });

  it("scales linearly below the saturation count", () => {
    expect(computeCurationConfidence(25)).toBeCloseTo(0.5, 5);
  });

  it("reaches 1 exactly at the saturation count", () => {
    expect(computeCurationConfidence(50)).toBe(1);
  });

  it("clamps at 1 for accounts well past saturation", () => {
    expect(computeCurationConfidence(500)).toBe(1);
  });
});

describe("computeAdjustmentBand", () => {
  it("uses the wide default band for a new account", () => {
    const { min, max } = computeAdjustmentBand(0);
    expect(min).toBeCloseTo(0.45, 5);
    expect(max).toBeCloseTo(1.6, 5);
  });

  it("narrows the band for a deeply curated account", () => {
    const { min, max } = computeAdjustmentBand(1);
    expect(min).toBeCloseTo(0.7, 5);
    expect(max).toBeCloseTo(1.3, 5);
  });

  it("interpolates at the midpoint", () => {
    const { min, max } = computeAdjustmentBand(0.5);
    expect(min).toBeCloseTo(0.575, 5);
    expect(max).toBeCloseTo(1.45, 5);
  });

  it("always keeps min below max across the confidence range", () => {
    for (const confidence of [0, 0.25, 0.5, 0.75, 1]) {
      const { min, max } = computeAdjustmentBand(confidence);
      expect(min).toBeLessThan(max);
    }
  });
});
