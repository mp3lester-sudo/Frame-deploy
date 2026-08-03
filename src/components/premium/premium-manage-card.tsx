"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isNativeApp } from "@/lib/native/is-native";

/**
 * Shown instead of the upgrade card once profiles.is_premium is true --
 * previously an active subscriber landing on /premium just saw the same
 * "Upgrade to Premium" pitch with no way to cancel, change plans, or see
 * an invoice from inside the app at all.
 */
export function PremiumManageCard({ currentPeriodEnd }: { currentPeriodEnd: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const native = isNativeApp();

  async function handleManage() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!data.url) {
        setError(data.error ?? "Could not open billing portal");
        return;
      }
      // Same reasoning as checkout (see PremiumUpgradeCard) -- billing
      // management should happen in the system browser, not the app's
      // own WebView, when running inside the native wrapper.
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
        <p className="mt-1 text-sm text-foreground-muted">
          You&apos;re subscribed.
          {currentPeriodEnd && ` Renews ${new Date(currentPeriodEnd).toLocaleDateString()}.`}
        </p>

        <Button className="mt-6 w-full" isLoading={loading} onClick={handleManage} variant="secondary">
          Manage subscription
        </Button>
        {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}
        <p className="mt-2 text-center text-xs text-foreground-muted">
          Cancel, change plans, or view invoices in Stripe&apos;s billing portal.
        </p>
      </Card>
    </div>
  );
}
