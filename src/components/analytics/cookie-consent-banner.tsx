"use client";

import { useState } from "react";
import { setConsent } from "@/lib/analytics/consent";
import { initPostHog } from "@/lib/analytics/posthog-client";
import { Button } from "@/components/ui/button";

/**
 * Gates PostHog behind an explicit choice instead of firing unconditionally
 * on every visit -- previously analytics initialized regardless of
 * consent, which doesn't match this app's own Privacy Policy explicitly
 * citing GDPR.
 *
 * Whether a RETURNING visitor (who already granted/declined) sees this at
 * all is decided by CSS plus a synchronous inline script in the root
 * layout (see the `consent-decided` class toggle there and the
 * `html.consent-decided .cookie-consent-banner` rule in globals.css) --
 * the same pre-hydration-script-plus-CSS-class pattern this codebase
 * already uses for the greeting splash. This component itself always
 * renders the exact same markup on the server and the client, so there
 * is no hydration mismatch for React to reconcile. Two earlier versions
 * tried to decide visibility from React state seeded by
 * localStorage/cookies (first a useState lazy initializer, then
 * useSyncExternalStore), and in production the banner stayed stuck
 * visible regardless of what was actually stored -- CSS-based hiding
 * sidesteps the whole class of problem instead of fighting hydration
 * timing.
 *
 * `decided` here only ever matters for the *current* session's click --
 * it starts false on both server and client (identical, no mismatch),
 * and only flips true in response to a real click, which is an ordinary
 * post-mount update, not an initial-render one.
 */
export function CookieConsentBanner() {
  const [decided, setDecided] = useState(false);

  if (decided) return null;

  function decide(value: "granted" | "denied") {
    setConsent(value);
    setDecided(true);
    if (value === "granted") initPostHog();
  }

  return (
    <div className="cookie-consent-banner fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.2)] md:bottom-16">
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-foreground-muted">
          We use analytics to understand how Marquee is used. No data is sold to third parties.{" "}
          <a href="/privacy" className="underline hover:text-accent">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => decide("denied")}>
            Decline
          </Button>
          <Button type="button" size="sm" onClick={() => decide("granted")}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
