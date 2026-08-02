"use client";

import { Button } from "@/components/ui/button";
import { REFERRAL_BONUS_DAYS } from "@/lib/referrals/constants";
import { isBonusWindowActive } from "@/lib/premium/is-premium";
import { useToast } from "@/components/ui/toast";

export function ReferralCard({
  referralLink,
  referralCount,
  bonusPremiumUntil,
}: {
  referralLink: string;
  referralCount: number;
  bonusPremiumUntil: string | null;
}) {
  const { showToast } = useToast();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralLink);
      showToast("Copied to clipboard");
    } catch {
      // Clipboard API blocked (permissions/insecure context) — the link is
      // still shown as selectable text below, so this is non-fatal.
    }
  }

  const bonusActive = isBonusWindowActive(bonusPremiumUntil);

  return (
    <div>
      <h2 className="mb-1 text-sm font-medium">Invite friends</h2>
      <p className="mb-3 text-xs text-foreground-muted">
        Share your link — every friend who signs up earns you {REFERRAL_BONUS_DAYS} days of Premium, free.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={referralLink}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-xs text-foreground-muted"
        />
        <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
          Copy link
        </Button>
      </div>

      <p className="mt-3 text-xs text-foreground-muted">
        {referralCount === 0 && "No signups yet — share your link to earn bonus Premium."}
        {referralCount === 1 && "1 friend has signed up with your link."}
        {referralCount > 1 && `${referralCount} friends have signed up with your link.`}
        {bonusActive && (
          <>
            {" "}
            Bonus Premium active until{" "}
            {new Date(bonusPremiumUntil!).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
          </>
        )}
      </p>
    </div>
  );
}
