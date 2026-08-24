import { describe, expect, it } from "vitest";
import { buildInstantTasteRead } from "../instant-taste-read";
import type { RatedTitleForAffinity } from "@/lib/recommendations/genre-affinity";

describe("buildInstantTasteRead", () => {
  it("returns null for no swipes", () => {
    expect(buildInstantTasteRead([])).toBeNull();
  });

  it("returns null when nothing clears the affinity threshold", () => {
    const swipes: RatedTitleForAffinity[] = [
      { score: 2.5, genres: ["Drama"] },
      { score: 2.5, genres: ["Drama"] },
    ];
    expect(buildInstantTasteRead(swipes)).toBeNull();
  });

  it("returns null for a genre only swiped once (below MIN_OCCURRENCES)", () => {
    const swipes: RatedTitleForAffinity[] = [{ score: 5, genres: ["Horror"] }];
    expect(buildInstantTasteRead(swipes)).toBeNull();
  });

  it("names a single genre with real affinity", () => {
    const swipes: RatedTitleForAffinity[] = [
      { score: 5, genres: ["Horror"] },
      { score: 4.5, genres: ["Horror"] },
    ];
    expect(buildInstantTasteRead(swipes)).toBe("You gravitate toward Horror");
  });

  it("names the top two genres when both qualify", () => {
    const swipes: RatedTitleForAffinity[] = [
      { score: 5, genres: ["Horror"] },
      { score: 5, genres: ["Horror"] },
      { score: 4.5, genres: ["Comedy"] },
      { score: 4.5, genres: ["Comedy"] },
    ];
    const result = buildInstantTasteRead(swipes);
    expect(result).toBe("You gravitate toward Horror and Comedy");
  });

  it("caps at two genres even when three qualify", () => {
    const swipes: RatedTitleForAffinity[] = [
      { score: 5, genres: ["Horror"] },
      { score: 5, genres: ["Horror"] },
      { score: 4.8, genres: ["Comedy"] },
      { score: 4.8, genres: ["Comedy"] },
      { score: 4.6, genres: ["Drama"] },
      { score: 4.6, genres: ["Drama"] },
    ];
    const result = buildInstantTasteRead(swipes);
    expect(result).toBe("You gravitate toward Horror and Comedy");
  });

  it("ignores a genre the person clearly dislikes", () => {
    const swipes: RatedTitleForAffinity[] = [
      { score: 1, genres: ["Horror"] },
      { score: 1, genres: ["Horror"] },
      { score: 5, genres: ["Comedy"] },
      { score: 5, genres: ["Comedy"] },
    ];
    expect(buildInstantTasteRead(swipes)).toBe("You gravitate toward Comedy");
  });
});
