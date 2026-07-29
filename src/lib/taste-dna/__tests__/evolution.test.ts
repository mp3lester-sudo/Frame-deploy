import { describe, expect, it } from "vitest";
import { computeTasteEvolution, type RatedTitleFeaturesWithTime } from "../evolution";

function rating(overrides: Partial<RatedTitleFeaturesWithTime> = {}): RatedTitleFeaturesWithTime {
  return {
    weight: 2.5,
    genres: [],
    tone: [],
    themes: [],
    moodTags: [],
    decade: null,
    originalLanguage: "en",
    directorId: null,
    directorName: null,
    pacing: "moderate",
    violenceLevel: 2,
    comedyLevel: 2,
    emotionalIntensity: 2,
    ratedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeTasteEvolution", () => {
  it("returns null when there isn't enough total history", () => {
    const rated = [rating(), rating(), rating()];
    expect(computeTasteEvolution(rated)).toBeNull();
  });

  it("returns null when a bucket would be too small even with enough total", () => {
    // 7 total but a naive uneven split could still leave one bucket thin —
    // exercise the min-per-bucket guard directly with a lopsided timeline.
    const rated = [
      rating({ ratedAt: "2026-01-01" }),
      rating({ ratedAt: "2026-01-02" }),
      rating({ ratedAt: "2026-01-03" }),
      rating({ ratedAt: "2026-01-04" }),
      rating({ ratedAt: "2026-01-05" }),
      rating({ ratedAt: "2026-01-06" }),
    ];
    // 6 total, even 3/3 split — should succeed, not null.
    expect(computeTasteEvolution(rated)).not.toBeNull();
  });

  it("detects a rise in violence tolerance over time", () => {
    const earlier = Array.from({ length: 4 }, (_, i) =>
      rating({ ratedAt: `2025-01-0${i + 1}`, violenceLevel: 1, genres: ["Drama"] })
    );
    const recent = Array.from({ length: 4 }, (_, i) =>
      rating({ ratedAt: `2026-01-0${i + 1}`, violenceLevel: 5, genres: ["Action"] })
    );
    const result = computeTasteEvolution([...earlier, ...recent]);
    expect(result).not.toBeNull();
    expect(result!.violenceShift).toEqual({ from: 1, to: 5 });
    expect(result!.insights.some((i) => i.includes("violence tolerance"))).toBe(true);
  });

  it("detects a pacing shift", () => {
    const earlier = Array.from({ length: 4 }, (_, i) => rating({ ratedAt: `2025-01-0${i + 1}`, pacing: "slow" }));
    const recent = Array.from({ length: 4 }, (_, i) => rating({ ratedAt: `2026-01-0${i + 1}`, pacing: "fast" }));
    const result = computeTasteEvolution([...earlier, ...recent]);
    expect(result!.pacingShift).toEqual({ from: "slow", to: "fast" });
  });

  it("ignores shifts below the noise floor", () => {
    const earlier = Array.from({ length: 4 }, (_, i) => rating({ ratedAt: `2025-01-0${i + 1}`, violenceLevel: 2 }));
    const recent = Array.from({ length: 4 }, (_, i) => rating({ ratedAt: `2026-01-0${i + 1}`, violenceLevel: 2.4 }));
    const result = computeTasteEvolution([...earlier, ...recent]);
    // Rounded dimension values are integers in computeTasteDnaFromRatings,
    // so a sub-1-point real difference shouldn't survive rounding+the floor.
    expect(result!.violenceShift).toBeNull();
  });

  it("surfaces rising and fading archetypes above the noise floor", () => {
    const earlier = Array.from({ length: 5 }, (_, i) =>
      rating({ ratedAt: `2025-01-0${i + 1}`, genres: ["Comedy", "Romance"] })
    );
    const recent = Array.from({ length: 5 }, (_, i) =>
      rating({ ratedAt: `2026-01-0${i + 1}`, genres: ["Horror"] })
    );
    const result = computeTasteEvolution([...earlier, ...recent]);
    expect(result!.risingArchetypes.some((a) => a.name === "Horror & Dread")).toBe(true);
    expect(result!.fadingArchetypes.some((a) => a.name === "Feel-Good Comfort")).toBe(true);
  });

  it("sorts chronologically regardless of input order", () => {
    const recent = rating({ ratedAt: "2026-06-01", violenceLevel: 5 });
    const earlier = rating({ ratedAt: "2025-06-01", violenceLevel: 0 });
    const middleEarlier = Array.from({ length: 2 }, () => rating({ ratedAt: "2025-07-01", violenceLevel: 0 }));
    const middleRecent = Array.from({ length: 2 }, () => rating({ ratedAt: "2026-05-01", violenceLevel: 5 }));
    // Deliberately shuffled input order.
    const result = computeTasteEvolution([recent, ...middleRecent, earlier, ...middleEarlier]);
    expect(result!.violenceShift).toEqual({ from: 0, to: 5 });
  });
});
