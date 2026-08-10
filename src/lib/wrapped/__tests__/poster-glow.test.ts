import { describe, it, expect } from "vitest";
import { getPosterGlow } from "@/lib/wrapped/poster-glow";

describe("getPosterGlow", () => {
  it("is deterministic for the same title id", () => {
    const a = getPosterGlow("title-123");
    const b = getPosterGlow("title-123");
    expect(a).toEqual(b);
  });

  it("returns valid hex colors", () => {
    const glow = getPosterGlow("some-title");
    expect(glow.from).toMatch(/^#[0-9a-f]{6}$/i);
    expect(glow.to).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("varies across different title ids", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `title-${i}`);
    const glows = new Set(ids.map((id) => getPosterGlow(id).from));
    expect(glows.size).toBeGreaterThan(1);
  });
});
