"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { updateList } from "@/lib/actions/lists";

/**
 * Growth audit finding: custom Lists already had public/private RLS and a
 * public detail page (middleware.ts deliberately excludes /lists so
 * /lists/[id] stays reachable logged out), but no share affordance and no
 * OG preview -- see opengraph-image.tsx alongside this route. Unlike
 * Wrapped/teaser/compatibility, a list is live editable content rather
 * than a point-in-time result, so there's no snapshot table here: the
 * share target is just the list's own URL, always current.
 */
export function ListShareButton({
  listId,
  isPublic,
  isOwner,
  title,
}: {
  listId: string;
  isPublic: boolean;
  isOwner: boolean;
  title: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [justShared, setJustShared] = useState(false);

  // A non-owner can only ever land here on a public list (RLS hides
  // private ones as a 404), so this only guards the owner-viewing-their-
  // own-private-list case.
  if (!isPublic && !isOwner) return null;

  async function share() {
    const url = `${window.location.origin}/lists/${listId}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${title} — a Slate list`, url });
        return;
      } catch {
        // Backed out of the share sheet -- fall through to clipboard copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Copied to clipboard");
    } catch {
      // Clipboard API blocked -- link is still visible in the address bar.
    }
  }

  function handleClick() {
    if (isPublic) {
      startTransition(share);
      return;
    }
    // Owner sharing a still-private list: flip it public first (a link
    // nobody but the owner can open isn't a useful thing to hand
    // someone), then share, matching the one-click intent of the button.
    startTransition(async () => {
      await updateList({ listId, isPublic: true });
      router.refresh();
      await share();
      setJustShared(true);
    });
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleClick} isLoading={isPending}>
      <Share2 size={14} />
      {!isPublic && !justShared ? "Make public & share" : "Share"}
    </Button>
  );
}
