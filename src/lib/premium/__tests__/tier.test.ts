import { describe, it, expect } from "vitest";
import {
  isAuteurActive,
  tierLabel,
  movieNightMaxParticipants,
  FREE_MOVIE_NIGHT_MAX_PARTICIPANTS,
  AUTEUR_MOVIE_NIGHT_MAX_PARTICIPANTS,
} from "@/lib/premium/tier";

describe("isAuteurActive", () => {
  it("is false for null/undefined profile", () => {
    expect(isAuteurActive(null)).toBe(false);
    expect(isAuteurActive(undefined)).toBe(false);
  });

  it("is false for a free account", () => {
    expect(isAuteurActive({ is_premium: false, premium_tier: null })).toBe(false);
  });

  it("is false for a Premium (not Auteur) subscriber", () => {
    expect(isAuteurActive({ is_premium: true, premium_tier: "premium" })).toBe(false);
  });

  it("is true only when both is_premium and premium_tier === 'auteur'", () => {
    expect(isAuteurActive({ is_premium: true, premium_tier: "auteur" })).toBe(true);
  });

  it("is false for a referral-bonus window (is_premium true, no tier set)", () => {
    // Bonus windows only ever grant standard Premium, never Auteur -- see
    // the doc comment on isAuteurActive.
    expect(isAuteurActive({ is_premium: true, premium_tier: null })).toBe(false);
  });

  it("is false if premium_tier is auteur but is_premium is somehow false", () => {
    expect(isAuteurActive({ is_premium: false, premium_tier: "auteur" })).toBe(false);
  });
});

describe("tierLabel", () => {
  it("labels auteur", () => {
    expect(tierLabel("auteur")).toBe("Slate Auteur");
  });

  it("labels premium and any other/missing value as Premium", () => {
    expect(tierLabel("premium")).toBe("Slate Premium");
    expect(tierLabel(null)).toBe("Slate Premium");
    expect(tierLabel(undefined)).toBe("Slate Premium");
  });
});

describe("movieNightMaxParticipants", () => {
  it("caps free and Premium hosts at the same free limit", () => {
    expect(movieNightMaxParticipants(null)).toBe(FREE_MOVIE_NIGHT_MAX_PARTICIPANTS);
    expect(movieNightMaxParticipants({ is_premium: true, premium_tier: "premium" })).toBe(
      FREE_MOVIE_NIGHT_MAX_PARTICIPANTS
    );
  });

  it("gives Auteur hosts the higher cap", () => {
    expect(movieNightMaxParticipants({ is_premium: true, premium_tier: "auteur" })).toBe(
      AUTEUR_MOVIE_NIGHT_MAX_PARTICIPANTS
    );
  });
});
