import { describe, it, expect } from "vitest";
import { computeGenreDistribution, buildFingerprintGradient, buildTasteQuote } from "@/lib/profile/taste-fingerprint";

describe("computeGenreDistribution", () => {
  it("returns an empty array for no ratings", () => {
    expect(computeGenreDistribution(new Map())).toEqual([]);
  });

  it("computes percentage shares that sum to 100", () => {
    const dist = computeGenreDistribution(new Map([["Drama", 6], ["Horror", 3], ["Comedy", 1]]));
    const total = dist.reduce((sum, s) => sum + s.pct, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(dist[0]).toEqual({ genre: "Drama", pct: 60 });
  });

  it("rolls up genres beyond topN into an Other slice", () => {
    const dist = computeGenreDistribution(
      new Map([["Drama", 5], ["Horror", 3], ["Comedy", 1], ["Action", 1]]),
      2
    );
    expect(dist).toEqual([
      { genre: "Drama", pct: 50 },
      { genre: "Horror", pct: 30 },
      { genre: "Other", pct: 20 },
    ]);
  });

  it("omits the Other slice when topN already covers everything", () => {
    const dist = computeGenreDistribution(new Map([["Drama", 5], ["Horror", 5]]), 5);
    expect(dist.some((s) => s.genre === "Other")).toBe(false);
  });
});

describe("buildFingerprintGradient", () => {
  it("returns a flat low-opacity ring for no data", () => {
    expect(buildFingerprintGradient([])).toBe("rgba(205,166,70,0.15) 0deg 360deg");
  });

  it("produces contiguous stops covering the full circle", () => {
    const gradient = buildFingerprintGradient([
      { genre: "Drama", pct: 60 },
      { genre: "Horror", pct: 40 },
    ]);
    expect(gradient).toContain("0.00deg 216.00deg");
    expect(gradient).toContain("216.00deg 360.00deg");
  });

  it("uses decreasing opacity for less prominent slices", () => {
    const gradient = buildFingerprintGradient([
      { genre: "Drama", pct: 50 },
      { genre: "Horror", pct: 50 },
    ]);
    expect(gradient).toContain("0.65");
    expect(gradient).toContain("0.48");
  });
});

describe("buildTasteQuote", () => {
  it("returns null with no watch history", () => {
    expect(buildTasteQuote("Film Buff", [], 0)).toBeNull();
  });

  it("returns null when there's only an Other slice", () => {
    expect(buildTasteQuote("Film Buff", [{ genre: "Other", pct: 100 }], 10)).toBeNull();
  });

  it("writes a one-genre sentence when there's no clear second genre", () => {
    expect(buildTasteQuote("Film Buff", [{ genre: "Drama", pct: 100 }], 10)).toBe(
      "A Film Buff drawn to Drama."
    );
  });

  it("writes a two-genre sentence when a second genre is present", () => {
    expect(
      buildTasteQuote("Film Buff", [{ genre: "Drama", pct: 60 }, { genre: "Horror", pct: 40 }], 10)
    ).toBe("A Film Buff drawn to Drama, with real range into Horror.");
  });

  it("falls back to a generic label when tier is unset", () => {
    expect(buildTasteQuote(null, [{ genre: "Drama", pct: 100 }], 10)).toBe(
      "A Slate member drawn to Drama."
    );
  });
});
