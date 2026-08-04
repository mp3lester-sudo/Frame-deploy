import { describe, it, expect } from "vitest";
import { isALevelActive, tierLabel } from "@/lib/premium/tier";

describe("isALevelActive", () => {
  it("is false for null/undefined profile", () => {
    expect(isALevelActive(null)).toBe(false);
    expect(isALevelActive(undefined)).toBe(false);
  });

  it("is false for a free account", () => {
    expect(isALevelActive({ is_premium: false, premium_tier: null })).toBe(false);
  });

  it("is false for a Premium (not A-List) subscriber", () => {
    expect(isALevelActive({ is_premium: true, premium_tier: "premium" })).toBe(false);
  });

  it("is true only when both is_premium and premium_tier === 'a_list'", () => {
    expect(isALevelActive({ is_premium: true, premium_tier: "a_list" })).toBe(true);
  });

  it("is false for a referral-bonus window (is_premium true, no tier set)", () => {
    // Bonus windows only ever grant standard Premium, never A-List -- see
    // the doc comment on isALevelActive.
    expect(isALevelActive({ is_premium: true, premium_tier: null })).toBe(false);
  });

  it("is false if premium_tier is a_list but is_premium is somehow false", () => {
    expect(isALevelActive({ is_premium: false, premium_tier: "a_list" })).toBe(false);
  });
});

describe("tierLabel", () => {
  it("labels a_list", () => {
    expect(tierLabel("a_list")).toBe("Backlot A-List");
  });

  it("labels premium and any other/missing value as Premium", () => {
    expect(tierLabel("premium")).toBe("Backlot Premium");
    expect(tierLabel(null)).toBe("Backlot Premium");
    expect(tierLabel(undefined)).toBe("Backlot Premium");
  });
});
