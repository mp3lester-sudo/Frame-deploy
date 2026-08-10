import { describe, it, expect } from "vitest";
import { computeCollaborativeSplit } from "../behavioral-collaborative";

describe("computeCollaborativeSplit", () => {
  it("gives the embedding-neighbor signal full weight when there's no behavioral overlap", () => {
    expect(computeCollaborativeSplit(false)).toEqual({ embeddingShare: 1, behavioralShare: 0 });
  });

  it("splits weight once real behavioral overlap exists", () => {
    const split = computeCollaborativeSplit(true);
    expect(split.behavioralShare).toBeGreaterThan(0);
    expect(split.embeddingShare).toBeLessThan(1);
  });

  it("always sums to 1, regardless of signal presence", () => {
    expect(computeCollaborativeSplit(false).embeddingShare + computeCollaborativeSplit(false).behavioralShare).toBe(1);
    expect(computeCollaborativeSplit(true).embeddingShare + computeCollaborativeSplit(true).behavioralShare).toBe(1);
  });

  it("never gives the behavioral signal more weight than the embedding signal", () => {
    const split = computeCollaborativeSplit(true);
    expect(split.behavioralShare).toBeLessThanOrEqual(split.embeddingShare);
  });
});
