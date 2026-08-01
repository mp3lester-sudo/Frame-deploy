import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export function TitleCard({
  title,
  reason,
  highlight,
  index = 0,
}: {
  title: Title;
  reason?: string;
  /** Gold rim + soft glow for a single "this is the one" tile — e.g. the
      #1 spot on the favorites podium. Not meant for routine use. */
  highlight?: boolean;
  /** Position within its grid — staggers this card's entrance animation
      so a whole page of results doesn't fade in as one flat block.
      Wrapped modulo 12 so a "load more" append never makes later cards
      wait almost a second just because they're the 80th item on the page. */
  index?: number;
}) {
  return (
    <Link
      href={`/movie/${title.id}`}
      className="stagger-card group block transition-transform duration-200 hover:-translate-y-1"
      style={{ animationDelay: `${(index % 12) * 40}ms` }}
    >
      <div
        className={cn(
          "relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)] bg-surface-raised transition-shadow duration-200 group-hover:shadow-[0_16px_32px_-12px_rgba(0,0,0,0.7)]",
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
