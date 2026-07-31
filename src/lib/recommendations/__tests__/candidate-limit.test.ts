import { describe, it, expect } from "vitest";
import { candidateLimitForGroupSize } from "@/lib/recommendations/movie-night";

describe("candidateLimitForGroupSize", () => {
  it("gives a solo host (mid-invite) a real choice, not just one pick", () => {
    expect(candidateLimitForGroupSize(1)).toBe(3);
  });

  it("shows exactly 3 for a 2-person group", () => {
    expect(candidateLimitForGroupSize(2)).toBe(3);
  });

  it("grows the pool by one candidate per additional person", () => {
    expect(candidateLimitForGroupSize(3)).toBe(4);
    expect(candidateLimitForGroupSize(4)).toBe(5);
    expect(candidateLimitForGroupSize(5)).toBe(6);
  });

  it("caps out at 12 so a big group isn't overwhelmed", () => {
    expect(candidateLimitForGroupSize(11)).toBe(12);
    expect(candidateLimitForGroupSize(20)).toBe(12);
  });
});
