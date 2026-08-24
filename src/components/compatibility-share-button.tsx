"use client";

import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { createCompatibilityShare } from "@/lib/actions/compatibility";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Turns an in-app TasteCompatibilityCard into a standalone, shareable
 * link -- see migration 0083 and src/lib/actions/compatibility.ts. Sits
 * below the card rather than inside it, since compatibility can't be
 * shared until it's actually computable (hasEnoughData).
 */
export function CompatibilityShareButton({ otherUserId, otherName }: { otherUserId: string; otherName: string }) {
  const [isPending, startTransition] = useTransition();
  const [shareId, setShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const link = shareId ? `${window.location.origin}/compatibility/${shareId}` : null;

  function handleShare() {
    setError(null);
    startTransition(async () => {
      const result = await createCompatibilityShare(otherUserId, otherName);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setShareId(result.id);
      const url = `${window.location.origin}/compatibility/${result.id}`;
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title: `You and ${otherName} on Slate`, url });
          return;
        } catch {
          // Backed out of the share sheet -- fall through to copy-link row.
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        showToast("Copied to clipboard");
      } catch {
        // Clipboard API blocked -- link is still shown as selectable text below.
      }
    });
  }

  return (
    <div className="mt-2">
      {shareId ? (
        <input
          readOnly
          value={link ?? ""}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-xs text-foreground-muted"
        />
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={handleShare} isLoading={isPending}>
          <Share2 size={14} />
          Share this
        </Button>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
