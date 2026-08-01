"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Session-scoped, not permanent -- dismissing it shouldn't require an
// upgrade to ever get it back, but it should reappear each new session so
// free accounts still get the occasional reminder that a paid tier exists.
// This key intentionally has nothing to do with is_premium itself (that
// check happens server-side in layout.tsx, which decides whether to
// render this component at all) -- it only remembers "dismissed this
// session," so a user who upgrades mid-session just stops seeing it next
// render regardless of this flag.
const DISMISS_KEY = "backlot:promo-banner-dismissed";

/**
 * The "ad-free" Premium perk only means something if free accounts
 * actually see *something* to go ad-free from. This is Backlot's own
 * house promo (there's no third-party ad network here) -- a single slim
 * line under the nav, not a modal or a blocking takeover, consistent with
 * PremiumUpsell's restrained, single-line style elsewhere in the app.
 * Rendered by layout.tsx only for signed-in, non-Premium accounts --
 * logged-out visitors get the landing page's own conversion funnel
 * instead, and Premium accounts never see this at all.
 */
export function PromoBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Deliberately in an effect, not a lazy useState initializer -- the
    // latter would run during SSR too (no sessionStorage there, so it'd
    // always take the "assume dismissed" default) and then disagree with
    // the client's first hydration render, the same hydration-mismatch
    // class of bug this pattern avoids elsewhere in the app (see
    // animated-counter.tsx's prefers-reduced-motion check).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex items-center justify-center gap-3 border-b border-accent/20 bg-surface px-4 py-2 text-center text-xs text-foreground-muted">
      <span>
        Go ad-free and unlock monthly Wrapped, unlimited Ask Backlot, and advanced filters with{" "}
        <Link href="/premium" className="font-medium text-accent hover:underline">
          Backlot Premium
        </Link>
        .
      </span>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss"
        className="shrink-0 text-foreground-muted hover:text-foreground"
      >
        &times;
      </button>
    </div>
  );
}
