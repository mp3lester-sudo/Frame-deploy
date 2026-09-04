"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createList } from "@/lib/actions/lists";
import { posthog } from "@/lib/analytics/posthog-client";

export function CreateListForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Create a list
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const id = await createList({ title, description, isPublic });
        posthog.capture("list_created", { is_public: isPublic });
        router.push(`/lists/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create list");
      }
    });
  }

  return (
    // bento-card, not the old flat border-border/bg-surface panel -- this
    // form used to be the one pre-glass leftover sitting directly above a
    // list of .bento-card rows on /lists (design audit, ranked item #9).
    <form onSubmit={handleSubmit} className="bento-card flex flex-col gap-3 p-4">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="List name (e.g. Best Heist Movies)" autoFocus />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What's this list about? (optional)"
        rows={2}
        className="w-full resize-y rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-base sm:text-sm placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
      />
      <label className="flex items-center gap-2 text-sm text-foreground-muted">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        Public — visible on your profile and to other people
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" isLoading={isPending} disabled={!title.trim()}>
          Create
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
