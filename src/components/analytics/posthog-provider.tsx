"use client";

import { useEffect, type ReactNode } from "react";
import { initPostHog } from "@/lib/analytics/posthog-client";
import { getConsent } from "@/lib/analytics/consent";
import { PostHogPageView } from "@/components/analytics/posthog-page-view";
import { PostHogIdentify } from "@/components/analytics/posthog-identify";
import { CookieConsentBanner } from "@/components/analytics/cookie-consent-banner";

/**
 * Root-level analytics wrapper -- initializes posthog-js once, tracks
 * pageviews on every client-side route change, and identifies the
 * logged-in user (if any) so events tie back to an account rather than
 * an anonymous device ID. Sits inside <body>, wrapping everything else,
 * same placement as the existing PageTransition wrapper it sits beside.
 */
export function PostHogProvider({ userId, children }: { userId?: string | null; children: ReactNode }) {
  // Only initializes if the visitor already granted consent on a previous
  // visit (see CookieConsentBanner) -- a fresh, undecided visitor gets no
  // PostHog calls at all until they explicitly accept.
  useEffect(() => {
    if (getConsent() === "granted") initPostHog();
  }, []);

  return (
    <>
      <PostHogPageView />
      <PostHogIdentify userId={userId ?? null} />
      {children}
      <CookieConsentBanner />
    </>
  );
}
