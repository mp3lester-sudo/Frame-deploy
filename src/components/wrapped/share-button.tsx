"use client";

import { useState, useTransition } from "react";
import { Share2, Download } from "lucide-react";
import { createWrappedShare } from "@/lib/actions/wrapped";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ShareWrappedButton({ year }: { year: number }) {
  const [isPending, startTransition] = useTransition();
  const [shareId, setShareId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const link = shareId ? `${window.location.origin}/wrapped/share/${shareId}` : null;

  function handleShare() {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createWrappedShare(year);
        setShareId(id);
        // Native share sheet where it exists (matches the InviteLink
        // pattern used for Movie Night invites) -- one tap into Messages/
        // Instagram/whatever instead of copy-then-switch-app-then-paste.
        // Falls through to the copy-link + save-image row below either
        // way, since navigator.share on most platforms shares the *link*,
        // not the downloadable Stories image -- that still needs its own
        // explicit "Save image" action.
        if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
          try {
            await navigator.share({
              title: `My ${year} Slate Wrapped`,
              url: `${window.location.origin}/wrapped/share/${id}`,
            });
          } catch {
            // Backed out of the share sheet -- not an error, the row below
            // still gives them a way to share.
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create a share link");
      }
    });
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Copied to clipboard");
    } catch {
      // Clipboard API blocked (permissions/insecure context) — the link is
      // still shown as selectable text, so this is non-fatal.
    }
  }

  if (shareId) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <input
            readOnly
            value={link ?? ""}
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-xs text-foreground-muted"
          />
          <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
            Copy link
          </Button>
        </div>
        {/* Stories-sized (1080x1920) PNG download -- a link doesn't
            unfurl a preview on Instagram/Snapchat Stories the way it
            does in iMessage or Twitter, so Wrapped's actual best
            distribution channel needs an image, not a URL. See
            /api/wrapped/[id]/story-image/route.ts. */}
        <a
          href={`/api/wrapped/${shareId}/story-image`}
          download={`slate-wrapped-${year}.png`}
          className="inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-accent"
        >
          <Download size={13} />
          Save image for Stories
        </a>
      </div>
    );
  }

  return (
    <div>
      <Button type="button" onClick={handleShare} isLoading={isPending}>
        <Share2 size={16} />
        Share my Wrapped
      </Button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
