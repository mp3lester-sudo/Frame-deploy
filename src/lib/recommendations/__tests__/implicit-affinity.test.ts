import { describe, it, expect } from "vitest";
import { implicitAffinityMultiplier } from "../implicit-affinity";

describe("implicitAffinityMultiplier", () => {
  const THRESHOLD = 0.5;

  it("applies no boost at or below the threshold", () => {
    expect(implicitAffinityMultiplier(0, THRESHOLD)).toBe(1);
    expect(implicitAffinityMultiplier(0.3, THRESHOLD)).toBe(1);
    expect(implicitAffinityMultiplier(THRESHOLD, THRESHOLD)).toBe(1);
  });

  it("scales the boost up as similarity approaches 1", () => {
    const mid = implicitAffinityMultiplier(0.75, THRESHOLD);
    const high = implicitAffinityMultiplier(0.9, THRESHOLD);
    expect(mid).toBeGreaterThan(1);
    expect(high).toBeGreaterThan(mid);
  });

  it("caps the boost at MAX_IMPLICIT_BOOST when maximally similar", () => {
    expect(implicitAffinityMultiplier(1, THRESHOLD)).toBeCloseTo(1.2, 5);
  });

  it("is a weaker swing than the dislike penalty's magnitude", () => {
    // 0.2 max boost vs. 0.5 max penalty in dislike-penalty.ts -- implicit
    // signals should never be able to outweigh an explicit one.
    const maxBoost = implicitAffinityMultiplier(1, THRESHOLD) - 1;
    expect(maxBoost).toBeLessThan(0.5);
  });

  it("is a pure linear ramp between threshold and 1", () => {
    const quarter = implicitAffinityMultiplier(0.5 + (1 - THRESHOLD) * 0.25, THRESHOLD);
    const half = implicitAffinityMultiplier(0.5 + (1 - THRESHOLD) * 0.5, THRESHOLD);
    expect(quarter - 1).toBeCloseTo((half - 1) / 2, 5);
  });
});
