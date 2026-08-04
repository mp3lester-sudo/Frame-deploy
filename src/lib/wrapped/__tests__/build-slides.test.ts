import { describe, it, expect } from "vitest";
import { buildWrappedSlides, formatHoursAsDaysAndHours } from "@/lib/wrapped/build-slides";
import type { WrappedResult } from "@/lib/taste-dna/wrapped";

function fullResult(overrides: Partial<WrappedResult> = {}): WrappedResult {
  return {
    year: 2026,
    totalRated: 42,
    totalHours: 88,
    topGenres: [{ genre: "Drama", count: 12 }, { genre: "Thriller", count: 8 }],
    topDirector: { id: "d1", name: "David Fincher", count: 5 },
    favoriteTitle: { id: "t1", name: "Se7en", posterUrl: "https://x/se7en.jpg", score: 5 },
    hiddenGem: { id: "t2", name: "Obscure Gem", posterUrl: "https://x/gem.jpg", score: 5 },
    topArchetype: { name: "Neo-Noir", percent: 34 },
    summary: "A year of dark, twisty stories.",
    ...overrides,
  };
}

describe("buildWrappedSlides", () => {
  it("always starts with intro and ends with finale", () => {
    const slides = buildWrappedSlides(fullResult(), "Your 2026 Wrapped");
    expect(slides[0]).toEqual({ type: "intro", headline: "Your 2026 Wrapped" });
    expect(slides[slides.length - 1].type).toBe("finale");
  });

  it("includes every optional slide when the underlying data is present", () => {
    const slides = buildWrappedSlides(fullResult(), "Your 2026 Wrapped");
    const types = slides.map((s) => s.type);
    expect(types).toEqual([
      "intro",
      "totalFilms",
      "totalHours",
      "topGenres",
      "topDirector",
      "archetype",
      "favoriteTitle",
      "hiddenGem",
      "finale",
    ]);
  });

  it("omits slides whose underlying field is null/empty", () => {
    const slides = buildWrappedSlides(
      fullResult({ topDirector: null, favoriteTitle: null, hiddenGem: null, topArchetype: null, topGenres: [] }),
      "Your 2026 Wrapped"
    );
    const types = slides.map((s) => s.type);
    expect(types).toEqual(["intro", "totalFilms", "totalHours", "finale"]);
  });

  it("omits totalFilms/totalHours slides when those counts are zero", () => {
    const slides = buildWrappedSlides(
      fullResult({ totalRated: 0, totalHours: 0, topGenres: [], topDirector: null, favoriteTitle: null, hiddenGem: null, topArchetype: null }),
      "headline"
    );
    expect(slides.map((s) => s.type)).toEqual(["intro", "finale"]);
  });

  it("finale slide carries the full result and summary text", () => {
    const result = fullResult();
    const slides = buildWrappedSlides(result, "Your 2026 Wrapped");
    const finale = slides[slides.length - 1];
    expect(finale).toEqual({ type: "finale", headline: "Your 2026 Wrapped", summary: result.summary, result });
  });
});

describe("formatHoursAsDaysAndHours", () => {
  it("splits an even multiple of 24 into whole days with 0 remaining hours", () => {
    expect(formatHoursAsDaysAndHours(48)).toEqual({ days: 2, hours: 0 });
  });

  it("splits a non-multiple into days plus remainder", () => {
    expect(formatHoursAsDaysAndHours(79)).toEqual({ days: 3, hours: 7 });
  });

  it("returns 0 days for anything under 24 hours", () => {
    expect(formatHoursAsDaysAndHours(10)).toEqual({ days: 0, hours: 10 });
  });

  it("handles zero", () => {
    expect(formatHoursAsDaysAndHours(0)).toEqual({ days: 0, hours: 0 });
  });
});
