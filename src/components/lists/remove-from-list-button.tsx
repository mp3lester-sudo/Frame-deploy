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
      aria-label="Remove from list"
      disabled={isPending}
      onClick={() => startTransition(() => removeTitleFromList({ listId, titleId }))}
      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground-muted opacity-100 transition-opacity hover:text-danger disabled:opacity-60 md:opacity-0 md:group-hover:opacity-100"
    >
      <X size={14} />
    </button>
  );
}
