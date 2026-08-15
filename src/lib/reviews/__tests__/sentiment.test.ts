import { describe, expect, it } from "vitest";
import { clampInferredScore } from "../sentiment";

describe("clampInferredScore", () => {
  it("rounds to the nearest half-star", () => {
    expect(clampInferredScore(3.3)).toBe(3.5);
    expect(clampInferredScore(3.2)).toBe(3.0);
    expect(clampInferredScore(4.7)).toBe(4.5);
  });

  it("clamps below the floor up to 0.5", () => {
    expect(clampInferredScore(0)).toBe(0.5);
    expect(clampInferredScore(-2)).toBe(0.5);
  });

  it("clamps above the ceiling down to 5.0", () => {
    expect(clampInferredScore(7)).toBe(5.0);
    expect(clampInferredScore(5.2)).toBe(5.0);
  });

  it("passes through an already-valid half-star score unchanged", () => {
    expect(clampInferredScore(2.5)).toBe(2.5);
    expect(clampInferredScore(4.0)).toBe(4.0);
  });

  it("returns null for non-finite input (a malformed model response)", () => {
    expect(clampInferredScore(NaN)).toBeNull();
    expect(clampInferredScore(Infinity)).toBeNull();
  });
});
