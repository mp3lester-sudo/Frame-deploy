import { describe, expect, it } from "vitest";
import { pickAdaptiveGenres, type SwipeSignal } from "../adaptive-onboarding";

function swipe(score: number, genres: string[]): SwipeSignal {
  return { score, genres };
}

describe("pickAdaptiveGenres", () => {
  it("returns no bias for an empty swipe history", () => {
    expect(pickAdaptiveGenres([])).toEqual({ favorGenres: [], avoidGenres: [] });
  });

  it("returns no bias when nothing has cleared the evidence threshold", () => {
    // Only one Horror swipe -- computeGenreAffinity itself requires >=2
    // occurrences before a genre gets any entry at all.
    const bias = pickAdaptiveGenres([swipe(5, ["Horror"])]);
    expect(bias).toEqual({ favorGenres: [], avoidGenres: [] });
  });

  it("favors a genre the user has repeatedly loved", () => {
    const bias = pickAdaptiveGenres([
      swipe(5, ["Horror"]),
      swipe(5, ["Horror"]),
      swipe(5, ["Horror"]),
    ]);
    expect(bias.favorGenres).toEqual(["Horror"]);
    expect(bias.avoidGenres).toEqual([]);
  });

  it("avoids a genre the user has repeatedly passed on", () => {
    const bias = pickAdaptiveGenres([
      swipe(1, ["Romance"]),
      swipe(1, ["Romance"]),
      swipe(1, ["Romance"]),
    ]);
    expect(bias.avoidGenres).toEqual(["Romance"]);
    expect(bias.favorGenres).toEqual([]);
  });

  it("ranks multiple favored genres by strength and caps at the configured count", () => {
    const bias = pickAdaptiveGenres([
      // Crime: mixed but net positive
      swipe(5, ["Crime"]),
      swipe(3, ["Crime"]),
      // Drama: consistently loved -- should outrank Crime
      swipe(5, ["Drama"]),
      swipe(5, ["Drama"]),
      // Comedy: consistently loved too
      swipe(5, ["Comedy"]),
      swipe(5, ["Comedy"]),
      // Action: consistently loved -- should get bumped by the cap
      swipe(5, ["Action"]),
      swipe(5, ["Action"]),
    ]);
    expect(bias.favorGenres).toHaveLength(3);
    expect(bias.favorGenres).toContain("Drama");
    expect(bias.favorGenres).toContain("Comedy");
    expect(bias.favorGenres).toContain("Action");
    expect(bias.favorGenres).not.toContain("Crime");
  });

  it("caps avoided genres at the configured count", () => {
    const bias = pickAdaptiveGenres([
      swipe(1, ["Horror"]),
      swipe(1, ["Horror"]),
      swipe(1, ["Romance"]),
      swipe(1, ["Romance"]),
      swipe(1, ["Mystery"]),
      swipe(1, ["Mystery"]),
    ]);
    expect(bias.avoidGenres).toHaveLength(2);
  });

  it("ignores genres outside the fixed anchor list", () => {
    const bias = pickAdaptiveGenres([
      swipe(5, ["Not A Real Genre"]),
      swipe(5, ["Not A Real Genre"]),
      swipe(5, ["Not A Real Genre"]),
    ]);
    expect(bias).toEqual({ favorGenres: [], avoidGenres: [] });
  });

  it("treats a genre with mild, inconsistent lean as neither favored nor avoided", () => {
    // Onboarding only ever rates 1/3/5 (see RATING_FOR in
    // onboarding-swipe.tsx) -- two "it's fine" and one "not for me"
    // averages to an affinity of roughly -0.07, inside the neutral band
    // on either side of the favor/avoid thresholds.
    const bias = pickAdaptiveGenres([
      swipe(3, ["Fantasy"]),
      swipe(3, ["Fantasy"]),
      swipe(1, ["Fantasy"]),
    ]);
    expect(bias.favorGenres).not.toContain("Fantasy");
    expect(bias.avoidGenres).not.toContain("Fantasy");
  });
});
