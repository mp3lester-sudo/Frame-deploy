import { describe, expect, it } from "vitest";
import { isPremiumActive } from "../is-premium";

describe("isPremiumActive", () => {
  it("returns false for null/undefined profile", () => {
    expect(isPremiumActive(null)).toBe(false);
    expect(isPremiumActive(undefined)).toBe(false);
  });

  it("returns true when is_premium is true regardless of bonus window", () => {
    expect(isPremiumActive({ is_premium: true, bonus_premium_until: null })).toBe(true);
  });

  it("returns false when neither is_premium nor a bonus window is active", () => {
    expect(isPremiumActive({ is_premium: false, bonus_premium_until: null })).toBe(false);
  });

  it("returns true when bonus_premium_until is in the future", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    expect(isPremiumActive({ is_premium: false, bonus_premium_until: future })).toBe(true);
  });

  it("returns false when bonus_premium_until has already passed", () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    expect(isPremiumActive({ is_premium: false, bonus_premium_until: past })).toBe(false);
  });
});
