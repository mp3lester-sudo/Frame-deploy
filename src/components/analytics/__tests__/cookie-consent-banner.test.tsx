import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CookieConsentBanner } from "@/components/analytics/cookie-consent-banner";

function clearAllCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  });
}

// Note: whether a RETURNING visitor (who already granted/declined) sees
// this banner at all is decided by CSS plus a pre-hydration inline
// script in the root layout, not by this component -- see the doc
// comment on CookieConsentBanner for why. That means this component
// always renders on mount in isolation (there's no stylesheet or inline
// script running in this test environment to hide it), and these tests
// cover the part that *is* this component's job: writing the choice on
// click and hiding itself for the rest of the session.
describe("CookieConsentBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearAllCookies();
  });

  it("renders on mount", () => {
    render(<CookieConsentBanner />);
    expect(screen.getByText(/No data is sold/i)).toBeInTheDocument();
  });

  it("hides immediately after clicking Accept and persists the choice", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(screen.queryByText(/No data is sold/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("slate_analytics_consent")).toBe("granted");
    expect(document.cookie).toContain("slate_analytics_consent=granted");
  });

  it("hides immediately after clicking Decline and persists the choice", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    expect(screen.queryByText(/No data is sold/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("slate_analytics_consent")).toBe("denied");
  });

  it("carries the cookie-consent-banner class the layout CSS rule targets", () => {
    const { container } = render(<CookieConsentBanner />);
    expect(container.querySelector(".cookie-consent-banner")).toBeInTheDocument();
  });
});
