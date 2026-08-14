"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { posthog } from "@/lib/analytics/posthog-client";
import { isNativeApp } from "@/lib/native/is-native";
import { siteOrigin } from "@/lib/seo/site";

const PREMIUM_FEATURES = [
  "Unlimited AI concierge conversations",
  "Advanced filters (mood, pacing, era, tone)",
  "Entertainment Wrapped, every month",
  "Ad-free, always",
];

// Everything below "Everything in Premium" is the Auteur-exclusive set --
// see src/lib/premium/tier.ts (isAuteurActive) for the gating helper each
// of these will check once it's actually built. As of this pricing page,
// only the tier/billing plumbing exists; these perks are the roadmap, not
// yet functional. See AUTEUR_PRICE_ID in lib/stripe.ts -- the buy button
// below stays disabled until that's set, specifically so nobody can pay
// for this before there's real Auteur-exclusive value behind it.
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

/**
 * Pricing framed as a literal admission ticket rather than a generic SaaS
 * pricing card -- "Marquee presents" / plan name in the marquee italic
 * serif / a perforated tear-line between the header and the feature list
 * (two notches cut into the card's sides, same trick real ticket stubs
 * use) / "Admit one" language on the features. Leans into the cinema
 * theme the rest of the app already commits to (onboarding intro, Wrapped
 * slides, the greeting marquee) instead of looking like it was pulled
 * from an unrelated SaaS template.
 */
function TicketCard({
  eyebrow = "Marquee presents",
  title,
  price,
  features,
  accented = false,
  children,
}: {
  eyebrow?: string;
  title: string;
  price: string;
  features: string[];
  accented?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--glass-bg)] backdrop-blur-xl"
      style={{
        borderColor: accented ? "rgba(217,184,118,0.5)" : "var(--glass-border)",
        boxShadow: accented ? "0 0 0 1px rgba(217,184,118,0.15), var(--glass-shadow)" : "var(--glass-shadow)",
      }}
    >
      <div className="p-6 pb-5 text-center">
        <p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">{eyebrow}</p>
        <h1 className="font-display mt-1 text-2xl italic text-accent-soft">{title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{price}</p>
      </div>

      {/* Perforated tear-line: a dashed rule with two circular notches
          punched into the card's edges, background-matched to the page
          so they read as cutouts rather than dots sitting on top. */}
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
        <p className="mb-3 text-[10px] uppercase tracking-wider text-foreground-muted">Admit one &middot; included</p>
        <ul className="flex flex-col gap-2 text-sm">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="text-accent">&#9733;</span>
              {f}
            </li>
          ))}
        </ul>
        {children}
      </div>
    </div>
  );
}

export function PremiumUpgradeCard({ auteurAvailable = false }: { auteurAvailable?: boolean }) {
  const [loadingTier, setLoadingTier] = useState<"premium" | "auteur" | null>(null);

  const native = isNativeApp();

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="grid gap-8 sm:grid-cols-2">
        <TicketCard title="Premium" price="$7.99 / month" features={PREMIUM_FEATURES}>
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
        </TicketCard>

        <TicketCard title="Auteur" price="$14.99 / month" features={AUTEUR_FEATURES} accented>
          {native ? (
            <p className="mt-6 text-center text-sm text-foreground-muted">
              To subscribe, visit{" "}
              <span className="text-foreground">{siteOrigin().replace(/^https?:\/\//, "")}</span> in your
              browser.
            </p>
          ) : auteurAvailable ? (
            <Button
              className="mt-6 w-full"
              isLoading={loadingTier === "auteur"}
              onClick={() => handleUpgrade("auteur")}
            >
              Upgrade to Auteur
            </Button>
          ) : (
            <Button className="mt-6 w-full" disabled variant="secondary">
              Coming soon
            </Button>
          )}
        </TicketCard>
      </div>
    </div>
  );
}
