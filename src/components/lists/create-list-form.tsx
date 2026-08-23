"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createList } from "@/lib/actions/lists";

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
        router.push(`/lists/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create list");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-4">
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
