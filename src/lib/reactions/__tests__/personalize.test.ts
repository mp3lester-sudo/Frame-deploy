import { describe, it, expect } from "vitest";
import { personalizedHotTakeScore, rankHotTakesForViewer } from "@/lib/reactions/personalize";
import { computeGenreAffinity } from "@/lib/recommendations/genre-affinity";
import type { ControversyScore } from "@/lib/reactions/rank";

const NEUTRAL_COUNTS = { agree: 0, disagree: 0, hot_take: 0, need_to_watch: 0 };

function candidate(reviewId: string, score: number, titleGenres: string[] | null, viewerRatingForTitle: number | null) {
  return { reviewId, counts: NEUTRAL_COUNTS, score, titleGenres, viewerRatingForTitle };
}

describe("personalizedHotTakeScore", () => {
  it("returns the raw controversy score unchanged for a cold-start viewer (no affinity data)", () => {
    const score = personalizedHotTakeScore(10, { titleGenres: ["Horror"], viewerRatingForTitle: null }, new Map());
    expect(score).toBeCloseTo(10);
  });

  it("boosts a candidate in a genre this viewer consistently loves", () => {
    const affinity = computeGenreAffinity([
      { score: 5, genres: ["Horror"] },
      { score: 4.5, genres: ["Horror"] },
      { score: 5, genres: ["Horror"] },
    ]);
    const boosted = personalizedHotTakeScore(10, { titleGenres: ["Horror"], viewerRatingForTitle: null }, affinity);
    expect(boosted).toBeGreaterThan(10);
  });

  it("dampens a candidate in a genre this viewer consistently dislikes", () => {
    const affinity = computeGenreAffinity([
      { score: 1, genres: ["Romance"] },
      { score: 0.5, genres: ["Romance"] },
      { score: 1, genres: ["Romance"] },
    ]);
    const dampened = personalizedHotTakeScore(10, { titleGenres: ["Romance"], viewerRatingForTitle: null }, affinity);
    expect(dampened).toBeLessThan(10);
  });

  it("gives an extra boost when the viewer rated the exact reviewed title highly", () => {
    const withoutOwnRating = personalizedHotTakeScore(10, { titleGenres: null, viewerRatingForTitle: null }, new Map());
    const withOwnRating = personalizedHotTakeScore(10, { titleGenres: null, viewerRatingForTitle: 5 }, new Map());
    expect(withOwnRating).toBeGreaterThan(withoutOwnRating);
  });

  it("does not boost for a merely average own rating", () => {
    const withAverageRating = personalizedHotTakeScore(10, { titleGenres: null, viewerRatingForTitle: 3 }, new Map());
    expect(withAverageRating).toBeCloseTo(10);
  });
});

describe("rankHotTakesForViewer", () => {
  it("preserves controversy order for a cold-start viewer", () => {
    const candidates = [candidate("a", 5, null, null), candidate("b", 3, null, null)];
    const ranked = rankHotTakesForViewer(candidates as unknown as (ControversyScore & { titleGenres: string[] | null; viewerRatingForTitle: number | null })[], new Map());
    expect(ranked.map((c) => c.reviewId)).toEqual(["a", "b"]);
  });

  it("can promote a lower-controversy take the viewer has strong affinity for above a higher-controversy one they don't", () => {
    const affinity = computeGenreAffinity([
      { score: 5, genres: ["Horror"] },
      { score: 5, genres: ["Horror"] },
      { score: 4.5, genres: ["Horror"] },
    ]);
    const candidates = [
      candidate("unrelated-but-more-controversial", 10, ["Romance"], null),
      candidate("horror-take-viewer-loved", 9.5, ["Horror"], 5),
    ];
    const ranked = rankHotTakesForViewer(candidates as unknown as (ControversyScore & { titleGenres: string[] | null; viewerRatingForTitle: number | null })[], affinity);
    expect(ranked[0].reviewId).toBe("horror-take-viewer-loved");
  });
});
