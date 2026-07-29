import { describe, it, expect } from "vitest";
import { qualityMultiplier } from "@/lib/recommendations/quality-weighting";

describe("qualityMultiplier", () => {
  it("returns a mild penalty for titles with no vote history", () => {
    expect(qualityMultiplier(null)).toBeCloseTo(0.85);
  });

  it("returns neutral (1.0) at the catalogue average rating", () => {
    expect(qualityMultiplier(7.2)).toBeCloseTo(1.0, 5);
  });

  it("returns the floor multiplier at or below the minimum rating", () => {
    expect(qualityMultiplier(4.0)).toBeCloseTo(0.6);
    expect(qualityMultiplier(1.0)).toBeCloseTo(0.6); // clamped
  });

  it("returns the ceiling multiplier at or above the maximum rating", () => {
    expect(qualityMultiplier(9.0)).toBeCloseTo(1.3);
    expect(qualityMultiplier(10.0)).toBeCloseTo(1.3); // clamped
  });

  it("is monotonically increasing with rating", () => {
    const ratings = [4, 5, 6, 7, 7.2, 7.5, 8, 8.5, 9];
    const mults = ratings.map(qualityMultiplier);
    for (let i = 1; i < mults.length; i++) {
      expect(mults[i]).toBeGreaterThanOrEqual(mults[i - 1]);
    }
  });

  it("penalizes a low-rated title relative to an average one", () => {
    expect(qualityMultiplier(5.0)).toBeLessThan(qualityMultiplier(7.2));
  });

  it("rewards a highly-rated title relative to an average one", () => {
    expect(qualityMultiplier(8.5)).toBeGreaterThan(qualityMultiplier(7.2));
  });
});
