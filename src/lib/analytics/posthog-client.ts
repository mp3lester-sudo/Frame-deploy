"use client";

import posthog from "posthog-js";

/**
 * Lazily initialized, module-scoped so every import gets the same
 * instance rather than re-initializing on each render. No-ops entirely
 * (init is simply never called) when NEXT_PUBLIC_POSTHOG_KEY isn't set --
 * local/dev environments and this sandbox both run with analytics
 * effectively disabled rather than erroring or sending events to nowhere.
 */
let initialized = false;

export function initPostHog() {
  if (initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // Pageviews are captured manually (see PostHogPageView) since the
    // App Router's client-side navigations don't fire the full-page
    // loads posthog-js's own autocapture pageview listener expects.
    capture_pageview: false,
    person_profiles: "identified_only",
  });
  initialized = true;
}

export { posthog };
