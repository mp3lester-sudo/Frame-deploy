import { describe, expect, it } from "vitest";
import { isFavoriteDirectorForUser, FAVORITE_DIRECTOR_TOP_N } from "../favorite-director-alerts";

describe("isFavoriteDirectorForUser", () => {
  it("returns false when the user has no ratings", () => {
    expect(isFavoriteDirectorForUser("d1", [], new Map())).toBe(false);
  });

  it("returns true when the director is the user's single top director", () => {
    const directorByTitle = new Map([
      ["t1", { id: "d1", name: "Denis Villeneuve" }],
      ["t2", { id: "d1", name: "Denis Villeneuve" }],
    ]);
    const ratings = [
      { titleId: "t1", score: 5 },
      { titleId: "t2", score: 4.5 },
    ];
    expect(isFavoriteDirectorForUser("d1", ratings, directorByTitle)).toBe(true);
  });

  it("returns false when the director falls outside the top N", () => {
    // Build 6 distinct directors, each with one highly-rated title, so
    // d6 (the one under test) ranks 6th -- outside the default top 5.
    const directorByTitle = new Map<string, { id: string; name: string }>();
    const ratings: { titleId: string; score: number }[] = [];
    for (let i = 1; i <= 6; i++) {
      const titleId = `t${i}`;
      const directorId = `d${i}`;
      directorByTitle.set(titleId, { id: directorId, name: directorId });
      // Higher-numbered directors get slightly lower scores so d6 (the
      // one under test) is unambiguously last.
      ratings.push({ titleId, score: 5 - i * 0.1 });
    }
    expect(isFavoriteDirectorForUser("d6", ratings, directorByTitle, FAVORITE_DIRECTOR_TOP_N)).toBe(false);
    // But d1 (the strongest) is comfortably inside the top N.
    expect(isFavoriteDirectorForUser("d1", ratings, directorByTitle, FAVORITE_DIRECTOR_TOP_N)).toBe(true);
  });

  it("respects a custom topN", () => {
    const directorByTitle = new Map([
      ["t1", { id: "d1", name: "A" }],
      ["t2", { id: "d2", name: "B" }],
    ]);
    const ratings = [
      { titleId: "t1", score: 5 },
      { titleId: "t2", score: 4.9 },
    ];
    // d2 ranks 2nd -- inside top 2, outside top 1.
    expect(isFavoriteDirectorForUser("d2", ratings, directorByTitle, 1)).toBe(false);
    expect(isFavoriteDirectorForUser("d2", ratings, directorByTitle, 2)).toBe(true);
  });

  it("ignores ratings for a director with only below-average scores", () => {
    const directorByTitle = new Map([["t1", { id: "d1", name: "A" }]]);
    const ratings = [{ titleId: "t1", score: 2 }];
    expect(isFavoriteDirectorForUser("d1", ratings, directorByTitle)).toBe(false);
  });

  it("returns false for a director the user has never rated a title from", () => {
    const directorByTitle = new Map([["t1", { id: "d1", name: "A" }]]);
    const ratings = [{ titleId: "t1", score: 5 }];
    expect(isFavoriteDirectorForUser("d-unknown", ratings, directorByTitle)).toBe(false);
  });
});
