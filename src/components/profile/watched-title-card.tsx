"use client";

import { useState, useTransition } from "react";
import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { X } from "lucide-react";
import { unrateTitle } from "@/lib/actions/social";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * Like TitleCard, but for the profile's own "Recently watched" grid — adds
 * a small remove button (own profile only) so a misclicked rating can be
 * undone right from where you'd notice it, without hunting down the
 * specific movie page. Removes itself from view optimistically.
 */
export function WatchedTitleCard({
  title,
  reason,
  canRemove,
}: {
  title: Title;
  reason?: string;
  canRemove: boolean;
}) {
  const [removed, setRemoved] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (removed) return null;

  function handleRemove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setRemoved(true);
    startTransition(async () => {
      try {
        await unrateTitle(title.id);
      } catch {
        setRemoved(false);
      }
    });
  }

  return (
    <Link href={`/movie/${title.id}`} className="group relative block">
      {canRemove && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          aria-label={`Remove ${title.name} from Recently watched`}
          title="Not watched — remove"
          className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-foreground-muted opacity-0 backdrop-blur-sm transition-opacity hover:text-danger group-hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
        {title.poster_url ? (
          <Image
            src={title.poster_url}
            alt={title.name}
            fill
            sizes="(max-width: 768px) 45vw, 200px"
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-foreground-muted">{title.name}</div>
        )}
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-medium">{title.name}</p>
      {reason && <p className="line-clamp-2 text-xs text-foreground-muted">{reason}</p>}
    </Link>
  );
}
