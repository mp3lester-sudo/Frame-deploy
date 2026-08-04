"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { posthog } from "@/lib/analytics/posthog-client";
import { isNativeApp } from "@/lib/native/is-native";
import { siteOrigin } from "@/lib/seo/site";

const PREMIUM_FEATURES = [
  "Unlimited AI concierge conversations",
  "Advanced filters (mood, pacing, era, tone)",
  "Entertainment Wrapped, every month",
  "Ad-free, always",
];

// Everything below "Everything in Premium" is the A-List-exclusive set --
// see src/lib/premium/tier.ts (isALevelActive) for the gating helper each
// of these will check once it's actually built. As of this pricing page,
// only the tier/billing plumbing exists; these perks are the roadmap, not
// yet functional. See ALIST_PRICE_ID in lib/stripe.ts -- the buy button
// below stays disabled until that's set, specifically so nobody can pay
// for this before there's real A-List-exclusive value behind it.
const ALIST_FEATURES = [
  "Everything in Premium",
  "Custom poster & backdrop for any title",
  "Entertainment Wrapped, every week",
  "Save your own Discover filter presets",
  "Priority AI concierge, no queue",
  "Bigger Movie Night groups",
  "Full Taste DNA: extended signature picks + evolution timeline",
  "Gold A-List badge on your profile",
  "Early access to new features",
];

export function PremiumUpgradeCard({ alistAvailable = false }: { alistAvailable?: boolean }) {
  const [loadingTier, setLoadingTier] = useState<"premium" | "a_list" | null>(null);

  const native = isNativeApp();

  // Only ever called from the non-native branches below (the native
  // branch renders no button at all -- see the JSX comment further down
  // for why), so this doesn't need its own native/browser-redirect split.
  async function handleUpgrade(tier: "premium" | "a_list") {
    setLoadingTier(tier);
    posthog.capture("premium_checkout_started", { tier });
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!data.url) return;
      window.location.href = data.url;
    } finally {
      setLoadingTier(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="p-6">
          <h1 className="font-display text-xl">Backlot Premium</h1>
          <p className="mt-1 text-sm text-foreground-muted">$7.99/month</p>

          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="text-accent">✓</span>
                {f}
              </li>
            ))}
          </ul>

          {native ? (
            // Deliberately no purchase button (and no clickable checkout
            // link) inside the native wrapper at all -- a browser-redirect
            // "Buy" button still puts a purchase flow one tap away from
            // inside the app, which is the exact pattern App Review most
            // often flags under 3.1.1 even when the actual charge happens
            // in Safari. Pointing people to the website with no in-app
            // affordance to start checkout is the more conservative
            // reading, same posture apps like Netflix/Spotify take.
            <p className="mt-6 text-center text-sm text-foreground-muted">
              To subscribe, visit{" "}
              <span className="text-foreground">{siteOrigin().replace(/^https?:\/\//, "")}</span> in your
              browser.
            </p>
          ) : (
            <Button
              className="mt-6 w-full"
              isLoading={loadingTier === "premium"}
              onClick={() => handleUpgrade("premium")}
            >
              Upgrade to Premium
            </Button>
          )}
        </Card>

        <Card className="border-accent/50 p-6">
          <h1 className="font-display text-xl">Backlot A-List</h1>
          <p className="mt-1 text-sm text-foreground-muted">$14.99/month</p>

          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {ALIST_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="text-accent">✓</span>
                {f}
              </li>
            ))}
          </ul>

          {native ? (
            <p className="mt-6 text-center text-sm text-foreground-muted">
              To subscribe, visit{" "}
              <span className="text-foreground">{siteOrigin().replace(/^https?:\/\//, "")}</span> in your
              browser.
            </p>
          ) : alistAvailable ? (
            <Button
              className="mt-6 w-full"
              isLoading={loadingTier === "a_list"}
              onClick={() => handleUpgrade("a_list")}
            >
              Upgrade to A-List
            </Button>
          ) : (
            <Button className="mt-6 w-full" disabled variant="secondary">
              Coming soon
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
