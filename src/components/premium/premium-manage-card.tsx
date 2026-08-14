"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native/is-native";
import { tierLabel } from "@/lib/premium/tier";

/**
 * Shown instead of the upgrade card once profiles.is_premium is true --
 * previously an active subscriber landing on /premium just saw the same
 * "Upgrade to Premium" pitch with no way to cancel, change plans, or see
 * an invoice from inside the app at all.
 *
 * Same ticket motif as PremiumUpgradeCard (perforated tear-line, "Marquee
 * presents" eyebrow) so an active subscriber's "you're in" moment reads
 * as the stub half of the same ticket they bought, not a different UI.
 */
export function PremiumManageCard({
  currentPeriodEnd,
  tier,
}: {
  currentPeriodEnd: string | null;
  tier?: string | null;
}) {
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
      <div
        className="relative overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--glass-bg)] backdrop-blur-xl"
        style={{
          borderColor: "rgba(217,184,118,0.5)",
          boxShadow: "0 0 0 1px rgba(217,184,118,0.15), var(--glass-shadow)",
        }}
      >
        <div className="p-6 pb-5 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Marquee presents</p>
          <h1 className="font-display mt-1 text-2xl italic text-accent-soft">{tierLabel(tier)}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            You&apos;re subscribed.
            {currentPeriodEnd && ` Renews ${new Date(currentPeriodEnd).toLocaleDateString()}.`}
          </p>
        </div>

        <div className="relative">
          <div
            className="absolute left-0 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background"
            aria-hidden
          />
          <div
            className="absolute right-0 top-1/2 h-6 w-6 -translate-y-1/2 translate-x-1/2 rounded-full bg-background"
            aria-hidden
          />
          <div className="border-t border-dashed" style={{ borderColor: "rgba(217,184,118,0.3)" }} />
        </div>

        <div className="p-6 pt-5">
          <Button className="w-full" isLoading={loading} onClick={handleManage} variant="secondary">
            Manage subscription
          </Button>
          {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}
          <p className="mt-2 text-center text-xs text-foreground-muted">
            Cancel, change plans, or view invoices in Stripe&apos;s billing portal.
          </p>
        </div>
      </div>
    </div>
  );
}
