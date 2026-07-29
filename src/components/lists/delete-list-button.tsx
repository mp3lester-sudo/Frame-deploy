"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteList } from "@/lib/actions/lists";

export function DeleteListButton({ listId }: { listId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Delete list
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground-muted">Delete this list?</span>
      <Button
        variant="danger"
        size="sm"
        isLoading={isPending}
        onClick={() =>
          startTransition(async () => {
            await deleteList(listId);
            router.push("/lists");
          })
        }
      >
        Confirm
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
