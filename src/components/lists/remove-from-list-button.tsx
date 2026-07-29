"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { removeTitleFromList } from "@/lib/actions/lists";

export function RemoveFromListButton({ listId, titleId }: { listId: string; titleId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title="Remove from list"
      disabled={isPending}
      onClick={() => startTransition(() => removeTitleFromList({ listId, titleId }))}
      className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-foreground-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 disabled:opacity-60"
    >
      <X size={14} />
    </button>
  );
}
