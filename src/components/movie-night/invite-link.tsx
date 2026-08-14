"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

/**
 * Alongside InviteForm's by-username invite (which only works for people
 * already on Marquee), this is what makes Movie Night reachable by
 * anyone: opening the link shows a preview at /movie-night/join/[token]
 * with no account needed, and joining from there is what actually creates
 * the account. The link itself is the same either way -- this just picks
 * the fastest way to hand it to someone. Where the native share sheet is
 * available (broad on mobile Safari/Chrome and inside the Capacitor
 * WebView, patchy-to-absent on desktop), that's the primary action: one
 * tap straight into Messages/WhatsApp/whatever, no manual copy-paste.
 * Falls back to the copy-link field everywhere else.
 */
export function InviteLink({ inviteLink }: { inviteLink: string }) {
  const { showToast } = useToast();
  // navigator.share only exists in the browser, and support varies by
  // engine -- checked once on mount rather than a lazy useState
  // initializer so SSR and the client's first render agree (no hydration
  // mismatch), same "read once on mount" pattern used for localStorage
  // reads elsewhere (see signup/page.tsx).
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function handleShare() {
    try {
      await navigator.share({
        title: "Movie night",
        text: "Help pick what we're watching tonight on Marquee",
        url: inviteLink,
      });
    } catch {
      // User backed out of the share sheet, or the share failed silently
      // (e.g. no share target chosen) -- neither is worth surfacing as an
      // error; the copy-link fallback below still works either way.
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      showToast("Copied to clipboard");
    } catch {
      // Clipboard API blocked -- the link is still shown as selectable
      // text below, so this is non-fatal.
    }
  }

  if (canShare) {
    return (
      <div>
        <Button type="button" onClick={handleShare} className="w-full">
          <Share2 size={16} />
          Share invite
        </Button>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-2 text-xs text-foreground-muted hover:text-accent"
        >
          Or copy the link
        </button>
      </div>
    );
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
