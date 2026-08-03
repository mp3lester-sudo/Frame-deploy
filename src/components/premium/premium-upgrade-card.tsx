"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { posthog } from "@/lib/analytics/posthog-client";
import { isNativeApp } from "@/lib/native/is-native";
import { siteOrigin } from "@/lib/seo/site";

const FEATURES = [
  "Unlimited AI concierge conversations",
  "Advanced filters (mood, pacing, era, tone)",
  "Entertainment Wrapped, every month",
  "Ad-free, always",
];

export function PremiumUpgradeCard() {
  const [loading, setLoading] = useState(false);

  const native = isNativeApp();

  // Only ever called from the non-native branch below (the native branch
  // renders no button at all -- see the JSX comment further down for why),
  // so this doesn't need its own native/browser-redirect split anymore.
  async function handleUpgrade() {
    setLoading(true);
    posthog.capture("premium_checkout_started");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (!data.url) return;
      window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-6">
        <h1 className="font-display text-xl">Backlot Premium</h1>
        <p className="mt-1 text-sm text-foreground-muted">$7.99/month</p>

        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {FEATURES.map((f) => (
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
            To subscribe to Premium, visit{" "}
            <span className="text-foreground">{siteOrigin().replace(/^https?:\/\//, "")}</span> in your
            browser.
          </p>
        ) : (
          <Button className="mt-6 w-full" isLoading={loading} onClick={handleUpgrade}>
            Upgrade to Premium
          </Button>
        )}
      </Card>
    </div>
  );
}
