"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { posthog } from "@/lib/analytics/posthog-client";
import { isNativeApp } from "@/lib/native/is-native";
import { siteOrigin } from "@/lib/seo/site";
import { joinAuteurWaitlist } from "@/lib/actions/users";

const PREMIUM_FEATURES = [
  "Unlimited AI concierge conversations",
  "Advanced filters (mood, pacing, era, tone)",
  "Entertainment Wrapped, every month",
  "Ad-free, always",
];

// Everything below "Everything in Premium" is the Auteur-exclusive set --
// see src/lib/premium/tier.ts (isAuteurActive) for the gating helper each
// of these actually checks (13 call sites: custom poster overrides, saved
// Discover presets, priority concierge, weekly Wrapped, extended Taste
// DNA, the profile badge, and more). The perks are built and shipped. The
// only missing piece is STRIPE_AUTEUR_PRICE_ID in lib/stripe.ts -- the buy
// button below stays disabled until that's set, so nobody can pay before
// checkout actually works. Until then it offers a waitlist instead (see
// joinAuteurWaitlist in lib/actions/users.ts) so purchase intent isn't
// just discarded.
const AUTEUR_FEATURES = [
  "Everything in Premium",
  "Custom poster & backdrop for any title",
  "Entertainment Wrapped, every week",
  "Save your own Discover filter presets",
  "Priority AI concierge, no queue",
  "Bigger Movie Night groups",
  "Full Taste DNA: extended signature picks + evolution timeline",
  "Gold Auteur badge on your profile",
  "Early access to new features",
];

export function PremiumUpgradeCard({
  auteurAvailable = false,
  auteurWaitlistJoined = false,
}: {
  auteurAvailable?: boolean;
  auteurWaitlistJoined?: boolean;
}) {
  const [loadingTier, setLoadingTier] = useState<"premium" | "auteur" | null>(null);
  const [waitlistJoined, setWaitlistJoined] = useState(auteurWaitlistJoined);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  const native = isNativeApp();

  async function handleJoinWaitlist() {
    setWaitlistLoading(true);
    setWaitlistError(null);
    posthog.capture("auteur_waitlist_joined");
    try {
      const result = await joinAuteurWaitlist();
      if ("error" in result) {
        setWaitlistError(result.error);
        return;
      }
      setWaitlistJoined(true);
    } finally {
      setWaitlistLoading(false);
    }
  }

  // Only ever called from the non-native branches below (the native
  // branch renders no button at all -- see the JSX comment further down
  // for why), so this doesn't need its own native/browser-redirect split.
  async function handleUpgrade(tier: "premium" | "auteur") {
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

  const nativeNotice = (
    <p className="mt-6 text-center text-sm text-foreground-muted">
      To subscribe, visit{" "}
      <span className="text-foreground">{siteOrigin().replace(/^https?:\/\//, "")}</span> in your browser.
    </p>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      {/* Previously two independent TicketCards side by side -- each its
          own bordered, shadowed rectangle, which reads as two SaaS
          pricing cards that happen to sit next to each other rather than
          two showtimes on the same bill. One shared .marquee-panel frame
          (same dashed-gold-border-with-lit-bulbs treatment as the auth
          screens) now holds both tiers, with a single dashed divider --
          borrowed from the ticket tear-line, including its die-cut
          notches -- between them, so this reads as one theater listing
          with two showings rather than two unrelated products. */}
      <div className="marquee-panel relative p-7">
        <div
          className="absolute left-1/2 top-0 hidden h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background sm:block"
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-1/2 hidden h-6 w-6 -translate-x-1/2 translate-y-1/2 rounded-full bg-background sm:block"
          aria-hidden
        />

        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-foreground-muted">Now showing</p>
        <h1 className="font-display mt-1 mb-6 text-center text-xl text-accent-soft">Two ways to see it</h1>

        <div
          className="grid gap-8 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-dashed"
          style={{ borderColor: "rgba(217,184,118,0.3)" }}
        >
          <div className="flex flex-col px-0 text-center sm:px-7">
            <p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Slate presents</p>
            <h2 className="font-display mt-1 text-2xl italic text-accent-soft">Premium</h2>
            <p className="mt-1 text-sm text-foreground-muted">$7.99 / month</p>
            <p className="mt-4 mb-2 text-[10px] uppercase tracking-wider text-foreground-muted">
              Admit one &middot; included
            </p>
            <ul className="flex flex-1 flex-col gap-2 text-left text-sm">
              {PREMIUM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-accent">&#9733;</span>
                  {f}
                </li>
              ))}
            </ul>
            {native ? (
              nativeNotice
            ) : (
              <Button
                className="mt-6 w-full"
                isLoading={loadingTier === "premium"}
                onClick={() => handleUpgrade("premium")}
              >
                Upgrade to Premium
              </Button>
            )}
          </div>

          <div
            className="mt-8 flex flex-col rounded-[var(--radius-md)] px-0 pt-8 text-center sm:mt-0 sm:rounded-none sm:px-7 sm:pt-0"
            style={{ backgroundColor: "rgba(217,184,118,0.04)" }}
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Slate presents</p>
            <h2 className="font-display mt-1 text-2xl italic text-accent-soft">Auteur</h2>
            <p className="mt-1 text-sm text-foreground-muted">$14.99 / month</p>
            <p className="mt-4 mb-2 text-[10px] uppercase tracking-wider text-foreground-muted">
              Admit one &middot; included
            </p>
            <ul className="flex flex-1 flex-col gap-2 text-left text-sm">
              {AUTEUR_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="text-accent">&#9733;</span>
                  {f}
                </li>
              ))}
            </ul>
            {native ? (
              nativeNotice
            ) : auteurAvailable ? (
              <Button
                className="mt-6 w-full"
                isLoading={loadingTier === "auteur"}
                onClick={() => handleUpgrade("auteur")}
              >
                Upgrade to Auteur
              </Button>
            ) : waitlistJoined ? (
              <p className="mt-6 text-center text-sm text-foreground-muted">
                You&rsquo;re on the list -- we&rsquo;ll email you when Auteur is ready to buy.
              </p>
            ) : (
              <div className="mt-6">
                <Button className="w-full" variant="secondary" isLoading={waitlistLoading} onClick={handleJoinWaitlist}>
                  Notify me when it&rsquo;s ready
                </Button>
                {waitlistError && <p className="mt-2 text-center text-xs text-danger">{waitlistError}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
