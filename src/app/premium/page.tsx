"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { posthog } from "@/lib/analytics/posthog-client";
import { isNativeApp } from "@/lib/native/is-native";

const FEATURES = [
  "Unlimited AI concierge conversations",
  "Advanced filters (mood, pacing, era, tone)",
  "Entertainment Wrapped, every month",
  "Ad-free, always",
];

export default function PremiumPage() {
  const [loading, setLoading] = useState(false);

  const native = isNativeApp();

  async function handleUpgrade() {
    setLoading(true);
    posthog.capture("premium_checkout_started");
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (!data.url) return;

      // Apple requires digital subscription purchases to either go through
      // StoreKit/In-App Purchase, or happen entirely outside the app. We do
      // the latter: inside the native wrapper, Checkout opens in the
      // system browser (Safari) instead of the app's own WebView, so the
      // purchase flow is never rendered inside the app itself.
      if (native) {
        window.open(data.url, "_blank");
      } else {
        window.location.href = data.url;
      }
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

        <Button className="mt-6 w-full" isLoading={loading} onClick={handleUpgrade}>
          Upgrade to Premium
        </Button>
        {native && (
          <p className="mt-2 text-center text-xs text-foreground-muted">
            Opens in your browser to complete purchase.
          </p>
        )}
      </Card>
    </div>
  );
}
