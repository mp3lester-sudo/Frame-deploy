import { describe, it, expect } from "vitest";
import {
  qualityMultiplier,
  passesQualityFloor,
  MIN_RECOMMENDABLE_RATING,
} from "@/lib/recommendations/quality-weighting";

describe("qualityMultiplier", () => {
  it("returns a mild penalty for titles with no vote history at all", () => {
    expect(qualityMultiplier(null)).toBeCloseTo(0.85);
    expect(qualityMultiplier(null, null)).toBeCloseTo(0.85);
  });

  it("returns neutral (1.0) at the catalogue average rating", () => {
    expect(qualityMultiplier(7.2)).toBeCloseTo(1.0, 5);
  });

  it("returns the floor multiplier at or below the minimum rating", () => {
    expect(qualityMultiplier(4.0)).toBeCloseTo(0.6);
    expect(qualityMultiplier(1.0)).toBeCloseTo(0.6); // clamped
  });

  it("returns the ceiling multiplier at or above the maximum rating", () => {
    expect(qualityMultiplier(9.0)).toBeCloseTo(1.3);
    expect(qualityMultiplier(10.0)).toBeCloseTo(1.3); // clamped
  });

  it("is monotonically increasing with rating", () => {
    const ratings = [4, 5, 6, 7, 7.2, 7.5, 8, 8.5, 9];
    const mults = ratings.map((r) => qualityMultiplier(r));
    for (let i = 1; i < mults.length; i++) {
      expect(mults[i]).toBeGreaterThanOrEqual(mults[i - 1]);
    }
  });

  it("penalizes a low-rated title relative to an average one", () => {
    expect(qualityMultiplier(5.0)).toBeLessThan(qualityMultiplier(7.2));
  });

  it("rewards a highly-rated title relative to an average one", () => {
    expect(qualityMultiplier(8.5)).toBeGreaterThan(qualityMultiplier(7.2));
  });

  describe("with rt_critic_score", () => {
    it("uses rt_critic_score alone when weighted_rating is missing", () => {
      // 20/100 RT -> rescaled to 2.0/10, well below the floor rating
      expect(qualityMultiplier(null, 20)).toBeCloseTo(qualityMultiplier(2.0));
    });

    it("Death Wish (2018) case: a decent-looking audience score gets pulled down hard by a critic bomb", () => {
      // weighted_rating 6.46 alone reads as "slightly below average" (~0.9x).
      // rt_critic_score 18 means critics call it a real bomb. The blend
      // should land at or near the floor multiplier, not a mild dip.
      const withoutRt = qualityMultiplier(6.46);
      const withRt = qualityMultiplier(6.46, 18);
      expect(withRt).toBeLessThan(withoutRt);
      expect(withRt).toBeCloseTo(0.6, 1);
    });

    it("does not let a great RT score fully erase a mediocre audience score", () => {
      // 95/100 RT -> 9.5/10, but weighted_rating only 5.0 -- blend should
      // sit between the two, weighted toward the worse (5.0) one, not
      // jump all the way to the ceiling.
      const blended = qualityMultiplier(5.0, 95);
      expect(blended).toBeGreaterThan(qualityMultiplier(5.0));
      expect(blended).toBeLessThan(qualityMultiplier(9.5));
    });

    it("barely moves the needle when both scores already agree", () => {
      // weighted_rating 8.0 and rt_critic_score 80 (-> 8.0/10) agree --
      // blending two equal numbers should return that same number.
      expect(qualityMultiplier(8.0, 80)).toBeCloseTo(qualityMultiplier(8.0), 5);
    });

    it("still clamps a critic-bomb blend to the floor, never below it", () => {
      expect(qualityMultiplier(3.0, 5)).toBeCloseTo(0.6);
    });
  });
});

describe("passesQualityFloor", () => {
  it("rejects a title with no rating data at all -- unknown quality is not 'highly rated'", () => {
    expect(passesQualityFloor(null)).toBe(false);
    expect(passesQualityFloor(null, null)).toBe(false);
  });

  it("rejects a title right below the hard floor", () => {
    expect(passesQualityFloor(MIN_RECOMMENDABLE_RATING - 0.1)).toBe(false);
  });

  it("accepts a title right at or above the hard floor", () => {
    expect(passesQualityFloor(MIN_RECOMMENDABLE_RATING)).toBe(true);
    expect(passesQualityFloor(MIN_RECOMMENDABLE_RATING + 0.5)).toBe(true);
  });

  it("Death Wish (2018) case: fails the hard floor even though weighted_rating alone would pass", () => {
    // weighted_rating 6.46 alone is already below 7.0, so this fails either
    // way -- the real regression case is a title whose weighted_rating
    // alone clears 7.0 but whose RT score reveals a critical bomb.
    expect(passesQualityFloor(6.46)).toBe(false);
    expect(passesQualityFloor(6.46, 18)).toBe(false);
  });

  it("a decent audience score with an RT bomb underneath it now fails the floor", () => {
    // weighted_rating 7.3 alone clears 7.0 comfortably. rt_critic_score 20
    // reveals the real consensus is bad -- the blend should pull this
    // below the floor even though the raw audience number looked fine.
    expect(passesQualityFloor(7.3)).toBe(true);
    expect(passesQualityFloor(7.3, 20)).toBe(false);
  });

  it("a genuinely well-reviewed title passes on weighted_rating alone", () => {
    expect(passesQualityFloor(8.2)).toBe(true);
  });

  it("a genuinely well-reviewed title passes with a strong RT score too", () => {
    expect(passesQualityFloor(7.5, 85)).toBe(true);
  });
});
