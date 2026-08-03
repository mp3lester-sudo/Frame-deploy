"use client";

const KEY = "backlot_analytics_consent";

export type ConsentState = "granted" | "denied" | null;

/** Reads the stored consent choice, or null if the visitor hasn't been
 *  asked yet (or their browser has no localStorage, e.g. private mode
 *  edge cases -- treated the same as "not yet decided" rather than
 *  throwing). */
export function getConsent(): ConsentState {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function setConsent(value: "granted" | "denied") {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Ignore -- worst case the banner reappears next visit.
  }
}
