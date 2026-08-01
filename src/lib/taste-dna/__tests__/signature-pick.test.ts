import { describe, it, expect } from "vitest";
import { pickSignatureCandidate, signatureMatchPercent } from "@/lib/taste-dna/signature-pick";

describe("pickSignatureCandidate", () => {
  it("returns null for an empty candidate list", () => {
    expect(pickSignatureCandidate([], new Set())).toBeNull();
  });

  it("picks the highest-similarity candidate", () => {
    const result = pickSignatureCandidate(
      [
        { titleId: "a", similarity: 0.6 },
        { titleId: "b", similarity: 0.81 },
        { titleId: "c", similarity: 0.72 },
      ],
      new Set()
    );
    expect(result).toEqual({ titleId: "b", similarity: 0.81 });
  });

  it("excludes titles the user has already rated, even if they'd otherwise win", () => {
    const result = pickSignatureCandidate(
      [
        { titleId: "a", similarity: 0.95 },
        { titleId: "b", similarity: 0.7 },
      ],
      new Set(["a"])
    );
    expect(result).toEqual({ titleId: "b", similarity: 0.7 });
  });

  it("excludes candidates below the minimum similarity", () => {
    const result = pickSignatureCandidate(
      [
        { titleId: "a", similarity: 0.3 },
        { titleId: "b", similarity: 0.4 },
      ],
      new Set(),
      0.5
    );
    expect(result).toBeNull();
  });

  it("returns null when every candidate is either rated or below threshold", () => {
    const result = pickSignatureCandidate(
      [
        { titleId: "a", similarity: 0.9 },
        { titleId: "b", similarity: 0.3 },
      ],
      new Set(["a"]),
      0.5
    );
    expect(result).toBeNull();
  });
});

describe("signatureMatchPercent", () => {
  it("clamps at the display floor for similarity at or below the floor", () => {
    expect(signatureMatchPercent(0.5)).toBe(80);
    expect(signatureMatchPercent(0.1)).toBe(80);
  });

  it("clamps at the display ceiling for similarity at or above the ceiling", () => {
    expect(signatureMatchPercent(0.92)).toBe(99);
    expect(signatureMatchPercent(1)).toBe(99);
  });

  it("scales linearly between floor and ceiling", () => {
    // Midpoint of [0.5, 0.92] -> midpoint of [80, 99]
    const mid = (0.5 + 0.92) / 2;
    expect(signatureMatchPercent(mid)).toBe(Math.round((80 + 99) / 2));
  });

  it("produces a monotonically increasing percentage as similarity rises", () => {
    const low = signatureMatchPercent(0.55);
    const mid = signatureMatchPercent(0.7);
    const high = signatureMatchPercent(0.85);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});
