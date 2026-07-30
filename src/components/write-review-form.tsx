"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { writeReview } from "@/lib/actions/social";
import { Button } from "@/components/ui/button";

// Starts collapsed as a plain link so it doesn't compete with the reviews
// already on the page; expands into the actual composer on click.
export function WriteReviewForm({ titleId }: { titleId: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [containsSpoilers, setContainsSpoilers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        await writeReview({ titleId, body: trimmed, containsSpoilers });
        setBody("");
        setContainsSpoilers(false);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not post review");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-accent hover:underline"
      >
        Write a review
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did you think?"
        rows={4}
        autoFocus
        disabled={isPending}
        className="w-full resize-none rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 text-sm text-foreground placeholder:text-foreground-muted focus:border-accent/50 focus:outline-none disabled:opacity-50"
      />
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-foreground-muted">
          <input
            type="checkbox"
            checked={containsSpoilers}
            onChange={(e) => setContainsSpoilers(e.target.checked)}
            disabled={isPending}
            className="h-3.5 w-3.5 rounded border-border accent-accent"
          />
          Contains spoilers
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              setOpen(false);
              setBody("");
              setError(null);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="secondary" disabled={isPending || !body.trim()} isLoading={isPending}>
            Post review
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </form>
  );
}
