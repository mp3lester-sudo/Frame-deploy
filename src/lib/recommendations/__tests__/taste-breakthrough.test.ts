import { describe, expect, it } from "vitest";
import { detectTasteBreakthrough } from "../taste-breakthrough";

describe("detectTasteBreakthrough", () => {
  it("returns null when the new rating isn't loved (below threshold)", () => {
    expect(detectTasteBreakthrough([], { score: 3.5, genres: ["Horror"] })).toBeNull();
  });

  it("returns null when the title has no genres", () => {
    expect(detectTasteBreakthrough([], { score: 5, genres: [] })).toBeNull();
    expect(detectTasteBreakthrough([], { score: 5, genres: null })).toBeNull();
  });

  it("flags a loved rating in a genre with no prior history as a breakthrough", () => {
    const result = detectTasteBreakthrough([], { score: 4.5, genres: ["Horror"] });
    expect(result).toEqual({ genre: "Horror" });
  });

  it("flags a loved rating in a genre the person has only lukewarm/negative history with", () => {
    const prior = [
      { score: 1, genres: ["Horror"] },
      { score: 1.5, genres: ["Horror"] },
    ];
    const result = detectTasteBreakthrough(prior, { score: 5, genres: ["Horror"] });
    expect(result).toEqual({ genre: "Horror" });
  });

  it("does not flag a genre the person already clearly loves", () => {
    const prior = [
      { score: 4.5, genres: ["Horror"] },
      { score: 5, genres: ["Horror"] },
      { score: 4, genres: ["Horror"] },
    ];
    const result = detectTasteBreakthrough(prior, { score: 4.5, genres: ["Horror"] });
    expect(result).toBeNull();
  });

  it("picks the first genre that is genuinely new territory among several", () => {
    const prior = [
      { score: 5, genres: ["Drama"] },
      { score: 4.5, genres: ["Drama"] },
    ];
    const result = detectTasteBreakthrough(prior, { score: 4.5, genres: ["Drama", "Horror"] });
    expect(result).toEqual({ genre: "Horror" });
  });

  it("ignores a genre with only one prior occurrence (below the evidence floor) as still new", () => {
    const prior = [{ score: 1, genres: ["Horror"] }];
    const result = detectTasteBreakthrough(prior, { score: 4.5, genres: ["Horror"] });
    expect(result).toEqual({ genre: "Horror" });
  });
});
