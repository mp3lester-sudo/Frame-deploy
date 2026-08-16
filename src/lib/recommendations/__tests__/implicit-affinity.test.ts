import { describe, it, expect } from "vitest";
import { implicitAffinityMultiplier } from "../implicit-affinity";

describe("implicitAffinityMultiplier", () => {
  const THRESHOLD = 0.5;

  it("applies no boost when both signals are at or below the threshold", () => {
    expect(implicitAffinityMultiplier(0, 0, THRESHOLD)).toBe(1);
    expect(implicitAffinityMultiplier(0.3, 0.3, THRESHOLD)).toBe(1);
    expect(implicitAffinityMultiplier(THRESHOLD, THRESHOLD, THRESHOLD)).toBe(1);
  });

  it("scales the watchlist boost up as similarity approaches 1", () => {
    const mid = implicitAffinityMultiplier(0.75, 0, THRESHOLD);
    const high = implicitAffinityMultiplier(0.9, 0, THRESHOLD);
    expect(mid).toBeGreaterThan(1);
    expect(high).toBeGreaterThan(mid);
  });

  it("scales the watched-unrated boost up as similarity approaches 1", () => {
    const mid = implicitAffinityMultiplier(0, 0.75, THRESHOLD);
    const high = implicitAffinityMultiplier(0, 0.9, THRESHOLD);
    expect(mid).toBeGreaterThan(1);
    expect(high).toBeGreaterThan(mid);
  });

  it("gives watchlist a stronger boost than watched-unrated for the same similarity", () => {
    const watchlistOnly = implicitAffinityMultiplier(0.9, 0, THRESHOLD);
    const watchedUnratedOnly = implicitAffinityMultiplier(0, 0.9, THRESHOLD);
    expect(watchlistOnly - 1).toBeGreaterThan(watchedUnratedOnly - 1);
  });

  it("caps each ramp at its own max boost when maximally similar", () => {
    expect(implicitAffinityMultiplier(1, 0, THRESHOLD)).toBeCloseTo(1.25, 5);
    expect(implicitAffinityMultiplier(0, 1, THRESHOLD)).toBeCloseTo(1.12, 5);
  });

  it("sums both deltas when a candidate matches both pools", () => {
    const combined = implicitAffinityMultiplier(1, 1, THRESHOLD);
    expect(combined).toBeCloseTo(1.37, 5);
  });

  it("is a weaker swing than the dislike penalty's magnitude even combined", () => {
    // 0.25 + 0.12 = 0.37 max combined boost vs. 0.5 max penalty in
    // dislike-penalty.ts -- implicit signals, however split, should never
    // be able to outweigh an explicit one.
    const maxCombinedBoost = implicitAffinityMultiplier(1, 1, THRESHOLD) - 1;
    expect(maxCombinedBoost).toBeLessThan(0.5);
  });

  it("is a pure linear ramp between threshold and 1", () => {
    const quarter = implicitAffinityMultiplier(0.5 + (1 - THRESHOLD) * 0.25, 0, THRESHOLD);
    const half = implicitAffinityMultiplier(0.5 + (1 - THRESHOLD) * 0.5, 0, THRESHOLD);
    expect(quarter - 1).toBeCloseTo((half - 1) / 2, 5);
  });

  it("defaults to full confidence (no scaling) when curationConfidence is omitted", () => {
    const omitted = implicitAffinityMultiplier(1, 1, THRESHOLD);
    const explicitFull = implicitAffinityMultiplier(1, 1, THRESHOLD, 1);
    expect(omitted).toBeCloseTo(explicitFull, 10);
  });

  it("scales the boost up for a brand new account (confidence 0)", () => {
    const newAccount = implicitAffinityMultiplier(1, 1, THRESHOLD, 0);
    const establishedAccount = implicitAffinityMultiplier(1, 1, THRESHOLD, 1);
    expect(newAccount).toBeGreaterThan(establishedAccount);
  });

  it("caps the zero-confidence combined boost below the dislike penalty's max magnitude", () => {
    const maxCombinedBoost = implicitAffinityMultiplier(1, 1, THRESHOLD, 0) - 1;
    expect(maxCombinedBoost).toBeLessThan(0.5);
  });

  it("interpolates smoothly between confidence 0 and 1", () => {
    const low = implicitAffinityMultiplier(1, 0, THRESHOLD, 0) - 1;
    const mid = implicitAffinityMultiplier(1, 0, THRESHOLD, 0.5) - 1;
    const high = implicitAffinityMultiplier(1, 0, THRESHOLD, 1) - 1;
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(high);
    expect(mid).toBeCloseTo((low + high) / 2, 5);
  });
});
