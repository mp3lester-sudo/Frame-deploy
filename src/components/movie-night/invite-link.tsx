"use client";

import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

/**
 * Alongside InviteForm's by-username invite (which only works for people
 * already on Backlot), this is the link that works for anyone -- opening
 * it shows a preview at /movie-night/join/[token] with no account needed,
 * and joining from there is what actually creates the account. Same
 * copy-to-clipboard + toast pattern as ReferralCard.
 */
export function InviteLink({ inviteLink }: { inviteLink: string }) {
  const { showToast } = useToast();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      showToast("Copied to clipboard");
    } catch {
      // Clipboard API blocked -- the link is still shown as selectable
      // text below, so this is non-fatal.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={inviteLink}
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-xs text-foreground-muted"
      />
      <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
        Copy link
      </Button>
    </div>
  );
}
