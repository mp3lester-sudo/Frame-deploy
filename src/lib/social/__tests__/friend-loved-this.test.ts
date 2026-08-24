import { describe, expect, it } from "vitest";
import { excerptReview, pickFriendHighlight, type FriendRatingCandidate } from "../friend-loved-this";

describe("pickFriendHighlight", () => {
  const candidate = (overrides: Partial<FriendRatingCandidate>): FriendRatingCandidate => ({
    userId: "user",
    score: 5,
    ratedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

  it("returns null for an empty list", () => {
    expect(pickFriendHighlight([])).toBeNull();
  });

  it("excludes ratings below the loved threshold", () => {
    expect(pickFriendHighlight([candidate({ score: 3.5 })])).toBeNull();
  });

  it("includes a rating right at the threshold", () => {
    expect(pickFriendHighlight([candidate({ score: 4 })])?.userId).toBe("user");
  });

  it("picks the highest score among qualifying candidates", () => {
    const candidates = [
      candidate({ userId: "a", score: 4 }),
      candidate({ userId: "b", score: 5 }),
      candidate({ userId: "c", score: 4.5 }),
    ];
    expect(pickFriendHighlight(candidates)?.userId).toBe("b");
  });

  it("breaks ties on score by most recent rating", () => {
    const candidates = [
      candidate({ userId: "old", score: 5, ratedAt: "2025-01-01T00:00:00.000Z" }),
      candidate({ userId: "new", score: 5, ratedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(pickFriendHighlight(candidates)?.userId).toBe("new");
  });

  it("ignores a more recent but lower-scoring candidate", () => {
    const candidates = [
      candidate({ userId: "loved", score: 5, ratedAt: "2020-01-01T00:00:00.000Z" }),
      candidate({ userId: "liked", score: 4, ratedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(pickFriendHighlight(candidates)?.userId).toBe("loved");
  });
});

describe("excerptReview", () => {
  it("returns short text unchanged", () => {
    expect(excerptReview("Loved it.")).toBe("Loved it.");
  });

  it("trims whitespace", () => {
    expect(excerptReview("  Loved it.  ")).toBe("Loved it.");
  });

  it("truncates long text at a word boundary with an ellipsis", () => {
    const body = "This movie completely blindsided me with how much it understood grief without ever naming it directly, which is rare.";
    const result = excerptReview(body, 40);
    expect(result.length).toBeLessThanOrEqual(41);
    expect(result.endsWith("…")).toBe(true);
    expect(result.endsWith(" …")).toBe(false);
  });

  it("does not cut a word in half", () => {
    const body = "Supercalifragilisticexpialidocious is a very long single word that exceeds the limit";
    const result = excerptReview(body, 10);
    // No space within the first 10 chars, so it must hard-cut but still append ellipsis
    expect(result.endsWith("…")).toBe(true);
  });
});
