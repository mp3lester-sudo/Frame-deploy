import { describe, it, expect, beforeEach } from "vitest";
import { getConsent, setConsent } from "@/lib/analytics/consent";

function clearAllCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  });
}

describe("analytics consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearAllCookies();
  });

  it("returns null when nothing has been decided yet", () => {
    expect(getConsent()).toBeNull();
  });

  it("persists granted consent via a cookie, not just localStorage", () => {
    setConsent("granted");
    expect(document.cookie).toContain("marquee_analytics_consent=granted");
    expect(getConsent()).toBe("granted");
  });

  it("persists denied consent", () => {
    setConsent("denied");
    expect(getConsent()).toBe("denied");
  });

  it("still reads a pre-existing localStorage-only value (pre-cookie migration)", () => {
    window.localStorage.setItem("marquee_analytics_consent", "granted");
    expect(getConsent()).toBe("granted");
  });

  it("survives localStorage being cleared as long as the cookie remains", () => {
    // Regression test: this is the failure mode reported in production --
    // the banner kept reappearing after Accept because the choice only
    // lived in localStorage, which embedded WebViews (e.g. the iOS app
    // shell) and private-browsing modes can wipe far more aggressively
    // than first-party cookies.
    setConsent("granted");
    window.localStorage.clear();
    expect(getConsent()).toBe("granted");
  });
});
