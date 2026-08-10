import { describe, it, expect } from "vitest";
import { dislikePenaltyMultiplier } from "../dislike-penalty";

describe("dislikePenaltyMultiplier", () => {
  const THRESHOLD = 0.5;

  it("applies no penalty at or below the threshold", () => {
    expect(dislikePenaltyMultiplier(0, THRESHOLD)).toBe(1);
    expect(dislikePenaltyMultiplier(0.3, THRESHOLD)).toBe(1);
    expect(dislikePenaltyMultiplier(THRESHOLD, THRESHOLD)).toBe(1);
  });

  it("scales the penalty up as similarity approaches 1", () => {
    const mid = dislikePenaltyMultiplier(0.75, THRESHOLD);
    const high = dislikePenaltyMultiplier(0.9, THRESHOLD);
    expect(mid).toBeLessThan(1);
    expect(high).toBeLessThan(mid);
  });

  it("caps the penalty at MAX_DISLIKE_PENALTY when maximally similar", () => {
    expect(dislikePenaltyMultiplier(1, THRESHOLD)).toBeCloseTo(0.5, 5);
  });

  it("never zeroes out a candidate outright -- soft nudge, not exclusion", () => {
    expect(dislikePenaltyMultiplier(1, THRESHOLD)).toBeGreaterThan(0);
  });

  it("is a pure linear ramp between threshold and 1", () => {
    const quarter = dislikePenaltyMultiplier(0.5 + (1 - THRESHOLD) * 0.25, THRESHOLD);
    const half = dislikePenaltyMultiplier(0.5 + (1 - THRESHOLD) * 0.5, THRESHOLD);
    // Equal steps in similarity should produce equal steps in multiplier.
    expect(1 - quarter).toBeCloseTo((1 - half) / 2, 5);
  });
});
