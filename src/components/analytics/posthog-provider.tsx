"use client";

import { useEffect, type ReactNode } from "react";
import { initPostHog } from "@/lib/analytics/posthog-client";
import { PostHogPageView } from "@/components/analytics/posthog-page-view";
import { PostHogIdentify } from "@/components/analytics/posthog-identify";

/**
 * Root-level analytics wrapper -- initializes posthog-js once, tracks
 * pageviews on every client-side route change, and identifies the
 * logged-in user (if any) so events tie back to an account rather than
 * an anonymous device ID. Sits inside <body>, wrapping everything else,
 * same placement as the existing PageTransition wrapper it sits beside.
 */
export function PostHogProvider({ userId, children }: { userId?: string | null; children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <>
      <PostHogPageView />
      <PostHogIdentify userId={userId ?? null} />
      {children}
    </>
  );
}
