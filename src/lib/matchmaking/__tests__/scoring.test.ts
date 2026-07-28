import { describe, it, expect } from "vitest";
import { computeCompatibility, type UserTasteSignal } from "@/lib/matchmaking/scoring";

function makeSignal(overrides: Partial<UserTasteSignal> = {}): UserTasteSignal {
  return {
    genreSentiment: {},
    embedding: null,
    ratingsById: {},
    favoriteGenres: [],
    favoriteDirectorIds: [],
    ...overrides,
  };
}

describe("computeCompatibility", () => {
  it("scores two users who love the same genres as highly compatible", () => {
    const a = makeSignal({ genreSentiment: { Horror: { sum: 1.8, count: 2 }, Drama: { sum: 1, count: 1 } } });
    const b = makeSignal({ genreSentiment: { Horror: { sum: 1.6, count: 2 }, Drama: { sum: 0.8, count: 1 } } });

    const result = computeCompatibility(a, b);
    expect(result.percent).toBeGreaterThan(85);
  });

  it("scores two users with opposite genre sentiment as low compatibility", () => {
    const a = makeSignal({ genreSentiment: { Horror: { sum: 2, count: 2 } } });
    const b = makeSignal({ genreSentiment: { Horror: { sum: -2, count: 2 } } });

    const result = computeCompatibility(a, b);
    expect(result.percent).toBeLessThan(30);
  });

  it("weighs embedding similarity in once both users have one", () => {
    const a = makeSignal({ embedding: [1, 0, 0] });
    const b = makeSignal({ embedding: [1, 0, 0] });

    const result = computeCompatibility(a, b);
    expect(result.percent).toBe(100);
  });

  it("factors in common-title agreement only when there are at least 2 shared ratings", () => {
    const withOneShared = computeCompatibility(
      makeSignal({ ratingsById: { "t1": 5 } }),
      makeSignal({ ratingsById: { "t1": 1 } })
    );
    // Only one common rated title and no genre/embedding data at all -> falls
    // back to the neutral default rather than being dragged down by one pair.
    expect(withOneShared.percent).toBe(50);

    const withTwoShared = computeCompatibility(
      makeSignal({ ratingsById: { t1: 5, t2: 5 } }),
      makeSignal({ ratingsById: { t1: 1, t2: 1 } })
    );
    expect(withTwoShared.percent).toBeLessThan(30);
    expect(withTwoShared.commonRatedCount).toBe(2);
  });

  it("finds shared favorite genres and directors", () => {
    const a = makeSignal({ favoriteGenres: ["Horror", "Thriller"], favoriteDirectorIds: ["d1", "d2"] });
    const b = makeSignal({ favoriteGenres: ["Thriller", "Comedy"], favoriteDirectorIds: ["d2", "d3"] });

    const result = computeCompatibility(a, b);
    expect(result.sharedFavoriteGenres).toEqual(["Thriller"]);
    expect(result.sharedFavoriteDirectorIds).toEqual(["d2"]);
  });

  it("surfaces the genre with the biggest sentiment gap as the biggest disagreement", () => {
    const a = makeSignal({
      genreSentiment: { Horror: { sum: 2, count: 2 }, Comedy: { sum: 0.9, count: 1 } },
    });
    const b = makeSignal({
      genreSentiment: { Horror: { sum: -1.8, count: 2 }, Comedy: { sum: 1, count: 1 } },
    });

    const result = computeCompatibility(a, b);
    expect(result.biggestDisagreementGenre).toBe("Horror");
  });

  it("returns no disagreement genre when sentiment is close across the board", () => {
    const a = makeSignal({ genreSentiment: { Drama: { sum: 1, count: 1 } } });
    const b = makeSignal({ genreSentiment: { Drama: { sum: 0.9, count: 1 } } });

    const result = computeCompatibility(a, b);
    expect(result.biggestDisagreementGenre).toBeNull();
  });

  it("defaults to a neutral 50% when there is no signal at all", () => {
    const result = computeCompatibility(makeSignal(), makeSignal());
    expect(result.percent).toBe(50);
  });
});
