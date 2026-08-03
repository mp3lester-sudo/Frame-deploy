import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CookieConsentBanner } from "@/components/analytics/cookie-consent-banner";

function clearAllCookies() {
  document.cookie.split(";").forEach((c) => {
    const name = c.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  });
}

describe("CookieConsentBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearAllCookies();
  });

  it("shows for an undecided visitor", () => {
    render(<CookieConsentBanner />);
    expect(screen.getByText(/No data is sold/i)).toBeInTheDocument();
  });

  it("hides immediately after clicking Accept", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(screen.queryByText(/No data is sold/i)).not.toBeInTheDocument();
  });

  it("hides immediately after clicking Decline", () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    expect(screen.queryByText(/No data is sold/i)).not.toBeInTheDocument();
  });

  it("stays hidden on a fresh mount after consent was already granted", () => {
    const { unmount } = render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    unmount();

    render(<CookieConsentBanner />);
    expect(screen.queryByText(/No data is sold/i)).not.toBeInTheDocument();
  });

  it("stays hidden even if localStorage is wiped, as long as the cookie survives", () => {
    const { unmount } = render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    window.localStorage.clear();
    unmount();

    render(<CookieConsentBanner />);
    expect(screen.queryByText(/No data is sold/i)).not.toBeInTheDocument();
  });
});
