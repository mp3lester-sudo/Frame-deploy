import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export function TitleCard({
  title,
  reason,
  highlight,
}: {
  title: Title;
  reason?: string;
  /** Gold rim + soft glow for a single "this is the one" tile — e.g. the
      #1 spot on the favorites podium. Not meant for routine use. */
  highlight?: boolean;
}) {
  return (
    <Link href={`/movie/${title.id}`} className="group block">
      <div
        className={cn(
          "relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)] bg-surface-raised",
          highlight &&
            "ring-2 ring-accent shadow-[0_0_20px_-4px_rgba(205,166,70,0.65)]"
        )}
      >
        {title.poster_url ? (
          <Image
            src={title.poster_url}
            alt={title.name}
            fill
            sizes="(max-width: 768px) 45vw, 200px"
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-foreground-muted">
            {title.name}
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-medium">{title.name}</p>
      {reason && <p className="line-clamp-2 text-xs text-foreground-muted">{reason}</p>}
    </Link>
  );
}
