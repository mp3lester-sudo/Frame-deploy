"use client";

import { useState, useTransition } from "react";
import { createWrappedShare } from "@/lib/actions/wrapped";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ShareWrappedButton({ year }: { year: number }) {
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  function handleShare() {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createWrappedShare(year);
        setLink(`${window.location.origin}/wrapped/share/${id}`);
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

  if (link) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-xs text-foreground-muted"
        />
        <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
          Copy link
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Button type="button" onClick={handleShare} isLoading={isPending}>
        Share my Wrapped
      </Button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
