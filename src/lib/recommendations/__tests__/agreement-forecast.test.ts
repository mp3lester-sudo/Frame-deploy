import { describe, expect, it } from "vitest";
import { buildAgreementForecast, type AgreementForecastInput } from "../agreement-forecast";

function compat(overrides: Partial<AgreementForecastInput["compatibility"]> = {}): AgreementForecastInput["compatibility"] {
  return {
    percent: 50,
    sharedFavoriteGenres: [],
    sharedFavoriteDirectors: [],
    biggestDisagreementGenre: null,
    commonRatedCount: 5,
    hasEnoughData: true,
    ...overrides,
  };
}

describe("buildAgreementForecast", () => {
  it("returns nothing when nobody has enough data", () => {
    const inputs = [{ name: "Sarah", compatibility: compat({ hasEnoughData: false }) }];
    expect(buildAgreementForecast(inputs)).toEqual([]);
  });

  it("returns nothing when no pairing clears the agreement bar and nobody disagrees", () => {
    const inputs = [{ name: "Sarah", compatibility: compat({ percent: 60, sharedFavoriteGenres: ["Horror"] }) }];
    expect(buildAgreementForecast(inputs)).toEqual([]);
  });

  it("surfaces the strongest agreement pairing", () => {
    const inputs = [{ name: "Sarah", compatibility: compat({ percent: 91, sharedFavoriteGenres: ["Horror"] }) }];
    expect(buildAgreementForecast(inputs)).toEqual(["You and Sarah almost always agree on Horror"]);
  });

  it("picks the highest-percent qualifying pairing when several clear the bar", () => {
    const inputs = [
      { name: "Sarah", compatibility: compat({ percent: 82, sharedFavoriteGenres: ["Horror"] }) },
      { name: "David", compatibility: compat({ percent: 95, sharedFavoriteGenres: ["Thriller"] }) },
    ];
    expect(buildAgreementForecast(inputs)).toEqual(["You and David almost always agree on Thriller"]);
  });

  it("surfaces the clearest divergence for someone other than the agreement pairing", () => {
    const inputs = [
      { name: "Sarah", compatibility: compat({ percent: 91, sharedFavoriteGenres: ["Horror"] }) },
      { name: "David", compatibility: compat({ percent: 55, biggestDisagreementGenre: "Romance" }) },
    ];
    expect(buildAgreementForecast(inputs)).toEqual([
      "You and Sarah almost always agree on Horror",
      "David tends to want something different than the group on Romance",
    ]);
  });

  it("caps at two lines", () => {
    const inputs = [
      { name: "Sarah", compatibility: compat({ percent: 91, sharedFavoriteGenres: ["Horror"] }) },
      { name: "David", compatibility: compat({ percent: 55, biggestDisagreementGenre: "Romance" }) },
      { name: "Priya", compatibility: compat({ percent: 40, biggestDisagreementGenre: "Comedy" }) },
    ];
    expect(buildAgreementForecast(inputs)).toHaveLength(2);
  });
});
