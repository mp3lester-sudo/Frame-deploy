"use client";

import { useState } from "react";
import { getConsent, setConsent, type ConsentState } from "@/lib/analytics/consent";
import { initPostHog } from "@/lib/analytics/posthog-client";

/**
 * Gates PostHog behind an explicit choice instead of firing unconditionally
 * on every visit -- previously analytics initialized regardless of
 * consent, which doesn't match this app's own Privacy Policy explicitly
 * citing GDPR. `useState(getConsent)` reads localStorage synchronously
 * once during the first render (a plain function, not a setState call
 * inside the effect body), same lazy-initializer pattern already used in
 * push-toggle.tsx for the same reason.
 */
export function CookieConsentBanner() {
  const [consent, setConsentState] = useState<ConsentState>(getConsent);

  if (consent !== null) return null;

  function decide(value: "granted" | "denied") {
    setConsent(value);
    setConsentState(value);
    if (value === "granted") initPostHog();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.2)] md:bottom-16">
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-foreground-muted">
          We use analytics to understand how Backlot is used. No data is sold to third parties.{" "}
          <a href="/privacy" className="underline hover:text-accent">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="rounded-[var(--radius-md)] border border-border px-3 py-1.5 text-xs text-foreground-muted hover:border-border-strong"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="rounded-[var(--radius-md)] border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
