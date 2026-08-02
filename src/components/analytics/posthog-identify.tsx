"use client";

import { useEffect } from "react";
import { posthog } from "@/lib/analytics/posthog-client";

/**
 * Ties subsequent events to the logged-in account instead of an anonymous
 * device ID. Calling identify() again with the same ID on every render is
 * a no-op on PostHog's end, so this doesn't need to guard against
 * re-running -- it only actually does anything the first time or when
 * userId changes (e.g. login/logout in the same tab).
 */
export function PostHogIdentify({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (userId) {
      posthog.identify(userId);
    } else {
      posthog.reset();
    }
  }, [userId]);

  return null;
}
