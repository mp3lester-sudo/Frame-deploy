"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { posthog } from "@/lib/analytics/posthog-client";

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const url = searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    posthog.capture("$pageview", { $current_url: url });
    // Deliberately re-fires on every pathname/searchParams change, which is
    // the whole point (one $pageview event per client-side navigation) --
    // not a missing-dependency bug.
  }, [pathname, searchParams]);

  return null;
}

/**
 * useSearchParams requires a Suspense boundary in the App Router (reading
 * it opts the component out of static rendering), so the actual tracking
 * logic is split into a child component wrapped here rather than adding
 * Suspense at the call site in PostHogProvider.
 */
export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PageViewTracker />
    </Suspense>
  );
}
