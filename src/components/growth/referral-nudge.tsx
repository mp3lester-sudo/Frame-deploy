"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REFERRAL_BONUS_DAYS } from "@/lib/referrals/constants";
import { useToast } from "@/components/ui/toast";

/**
 * Compact, contextual referral CTA (growth audit finding: the referral
 * link previously only ever surfaced in Settings, a place people visit
 * to configure things, not a place they visit because they're happy).
 * Dropped inline right after a high-satisfaction moment instead --
 * Movie Night's decided pick and Wrapped's finale slide -- where "that
 * was good, who else would like this" is the actual thought a user is
 * having. Mutual framing ("you both get") matches the mutual bonus now
 * granted by record_referral() (migration 0084) -- a one-sided "refer
 * and earn" ask reads as self-interested in a moment this genuine.
 */
export function ReferralNudge({ referralLink, prompt }: { referralLink: string; prompt: string }) {
  const { showToast } = useToast();

  async function handleShare() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Join me on Slate",
          text: `Sign up with my link and we both get ${REFERRAL_BONUS_DAYS} days of Premium free.`,
          url: referralLink,
        });
        return;
      } catch {
        // Backed out of the share sheet -- fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(referralLink);
      showToast("Copied to clipboard");
    } catch {
      // Clipboard API blocked -- nothing else to fall back to here, this
      // is a low-stakes nudge, not a primary action worth more UI for.
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-center">
      <p className="text-xs text-foreground-muted">
        {prompt} You both get {REFERRAL_BONUS_DAYS} days of Premium.
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={handleShare}>
        <Share2 size={13} />
        Invite a friend
      </Button>
    </div>
  );
}
