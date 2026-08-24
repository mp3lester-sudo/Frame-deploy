import { describe, it, expect } from "vitest";
import { blendDiscoverScore, rankTitlesByBlendedScore, type PersonalizableTitle } from "@/lib/discover/personalize";

function title(id: string, weighted_rating: number | null): PersonalizableTitle {
  return { id, name: id, poster_url: null, type: "movie", in_production: null, weighted_rating } as PersonalizableTitle;
}

describe("blendDiscoverScore", () => {
  it("falls back to quality-only when there is no similarity", () => {
    expect(blendDiscoverScore(8, undefined)).toBeCloseTo(0.8);
    expect(blendDiscoverScore(null, undefined)).toBe(0);
  });

  it("weights taste similarity more heavily than weighted_rating", () => {
    const highTasteLowQuality = blendDiscoverScore(2, 0.95);
    const lowTasteHighQuality = blendDiscoverScore(9.5, 0.1);
    expect(highTasteLowQuality).toBeGreaterThan(lowTasteHighQuality);
  });

  it("clamps similarity into [0, 1] rather than letting a negative cosine distance invert the score", () => {
    expect(blendDiscoverScore(5, -0.2)).toBe(blendDiscoverScore(5, 0));
    expect(blendDiscoverScore(5, 1.4)).toBe(blendDiscoverScore(5, 1));
  });
});

describe("rankTitlesByBlendedScore", () => {
  it("preserves the original weighted_rating order when no similarity data exists (cold start)", () => {
    const titles = [title("a", 9), title("b", 8), title("c", 7)];
    const ranked = rankTitlesByBlendedScore(titles, new Map());
    expect(ranked.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("reorders toward a title the viewer's taste vector is close to, even if it's rated lower", () => {
    const titles = [title("popular-but-not-for-you", 9), title("niche-but-perfect-for-you", 6)];
    const ranked = rankTitlesByBlendedScore(
      titles,
      new Map([
        ["popular-but-not-for-you", 0.1],
        ["niche-but-perfect-for-you", 0.98],
      ])
    );
    expect(ranked[0].id).toBe("niche-but-perfect-for-you");
  });

  it("only reorders titles that actually have similarity data, leaving the rest in place", () => {
    const titles = [title("a", 4), title("b", 3), title("c", 5)];
    // Only "c" has a similarity score, strong enough to overtake "a" and
    // "b" (which fall back to quality-only); "a" and "b" should keep their
    // relative order among themselves.
    const ranked = rankTitlesByBlendedScore(titles, new Map([["c", 0.99]]));
    expect(ranked[0].id).toBe("c");
    expect(ranked.slice(1).map((t) => t.id)).toEqual(["a", "b"]);
  });
});
