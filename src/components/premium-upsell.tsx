import Link from "next/link";

/**
 * Small, reusable "this is a Premium perk" nudge. Deliberately understated —
 * a single line with an inline link, not a modal or a blocking banner,
 * consistent with the app's restrained editorial design (see globals.css's
 * design-system comment). Used anywhere a Premium-gated feature needs to
 * explain itself to a free account without feeling like a hard paywall.
 */
export function PremiumUpsell({ message }: { message: string }) {
  return (
    <p className="text-xs text-foreground-muted">
      {message}{" "}
      <Link href="/premium" className="text-accent hover:underline">
        Upgrade to Premium
      </Link>
      .
    </p>
  );
}
