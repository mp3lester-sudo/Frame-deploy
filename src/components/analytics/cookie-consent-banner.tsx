"use client";

import { useSyncExternalStore } from "react";
import { getConsent, setConsent, type ConsentState } from "@/lib/analytics/consent";
import { initPostHog } from "@/lib/analytics/posthog-client";

type Listener = () => void;
let listeners: Listener[] = [];

function subscribe(listener: Listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ConsentState {
  return getConsent();
}

// The server has no window/localStorage/cookies to read, so it can only
// ever report "undecided" -- see the component doc comment below for why
// that (not the useState lazy initializer this used to be) is what
// actually makes hydration safe here.
function getServerSnapshot(): ConsentState {
  return null;
}

/**
 * Gates PostHog behind an explicit choice instead of firing unconditionally
 * on every visit -- previously analytics initialized regardless of
 * consent, which doesn't match this app's own Privacy Policy explicitly
 * citing GDPR.
 *
 * Uses useSyncExternalStore rather than a useState lazy initializer (the
 * previous approach) specifically because this component's whole job is
 * deciding *whether to render at all* based on browser-only storage. A
 * lazy initializer runs during the client's first render too -- for a
 * returning visitor who'd already granted or declined, that makes the
 * client's first-render output ("no banner") diverge from the server's
 * ("banner visible", since the server has no window to read). React does
 * not reliably repair hydration mismatches that change whether an
 * element renders at all, and in production this showed up as the
 * banner staying stuck on screen permanently -- clicks and all -- even
 * though the correct choice was already sitting in storage.
 * useSyncExternalStore is the API React ships specifically for this:
 * getServerSnapshot always returns "undecided" so the server and the
 * client's first paint agree, and the real value swaps in right after
 * via the same subscribe/notify mechanism a genuinely external store
 * would use, so no hydration mismatch is possible.
 */
export function CookieConsentBanner() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (consent !== null) return null;

  function decide(value: "granted" | "denied") {
    setConsent(value);
    notifyListeners();
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
