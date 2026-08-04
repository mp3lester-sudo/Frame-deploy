"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { setTitleImageOverride, clearTitleImageOverride } from "@/lib/actions/title-image-overrides";

/**
 * Auteur-exclusive (task #339) -- only rendered by the movie page when
 * isAuteurActive is true, though setTitleImageOverride re-checks
 * server-side too (see that action's doc comment). Per-viewer, not a
 * catalogue edit: this changes what YOU see for this title, not what
 * anyone else does -- see migration 0047's comment.
 */
export function CustomizeTitleImages({
  titleId,
  hasOverride,
  initialPosterUrl,
  initialBackdropUrl,
}: {
  titleId: string;
  hasOverride: boolean;
  initialPosterUrl: string;
  initialBackdropUrl: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [posterUrl, setPosterUrl] = useState(initialPosterUrl);
  const [backdropUrl, setBackdropUrl] = useState(initialBackdropUrl);

  function handleSave() {
    startTransition(async () => {
      try {
        await setTitleImageOverride({
          titleId,
          posterUrl: posterUrl.trim() || null,
          backdropUrl: backdropUrl.trim() || null,
        });
        showToast("Custom art saved");
        setOpen(false);
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not save custom art");
      }
    });
  }

  function handleReset() {
    startTransition(async () => {
      try {
        await clearTitleImageOverride({ titleId });
        setPosterUrl("");
        setBackdropUrl("");
        showToast("Reset to the default art");
        setOpen(false);
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not reset");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-accent"
      >
        <Pencil className="h-3 w-3" />
        {hasOverride ? "Edit custom art" : "Customize poster & backdrop"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wider text-foreground-muted">
        Custom art (only you see this)
      </p>
      <Input
        value={posterUrl}
        onChange={(e) => setPosterUrl(e.target.value)}
        placeholder="Poster image URL"
        className="h-8 text-xs"
      />
      <Input
        value={backdropUrl}
        onChange={(e) => setBackdropUrl(e.target.value)}
        placeholder="Backdrop image URL"
        className="h-8 text-xs"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} isLoading={isPending}>
          Save
        </Button>
        {hasOverride && (
          <Button size="sm" variant="secondary" onClick={handleReset} disabled={isPending}>
            Reset to default
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
