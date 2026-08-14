"use client";

const KEY = "marquee_analytics_consent";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ConsentState = "granted" | "denied" | null;

function parseValue(value: string | null): ConsentState {
  return value === "granted" || value === "denied" ? value : null;
}

function readCookie(): ConsentState {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${KEY}=([^;]*)`));
    return parseValue(match ? decodeURIComponent(match[1]) : null);
  } catch {
    return null;
  }
}

function writeCookie(value: "granted" | "denied") {
  try {
    document.cookie = `${KEY}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Ignore -- localStorage below is the fallback mechanism.
  }
}

/** Reads the stored consent choice, or null if the visitor hasn't been
 *  asked yet. Checks a cookie first -- cookies persist far more reliably
 *  than localStorage across private-browsing modes and embedded WebViews
 *  (notably the iOS Capacitor app shell), where localStorage can be
 *  partitioned or wiped between launches, causing this banner to
 *  reappear on every visit even after the visitor already chose Accept.
 *  Falls back to localStorage for anyone who only ever had the older
 *  localStorage-only value stored, and as a second line of defense if
 *  cookies are somehow unavailable. */
export function getConsent(): ConsentState {
  if (typeof window === "undefined") return null;
  const fromCookie = readCookie();
  if (fromCookie) return fromCookie;
  try {
    return parseValue(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Writes to both the cookie (primary) and localStorage (fallback) so the
 *  choice survives even in contexts where one of the two is restricted. */
export function setConsent(value: "granted" | "denied") {
  writeCookie(value);
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Ignore -- the cookie write above is the primary mechanism now.
  }
}
