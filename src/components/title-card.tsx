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
        {title.type === "tv" && title.in_production && (
          <span className="absolute left-1.5 top-1.5 rounded-[var(--radius-sm)] bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-foreground">
            On air
          </span>
        )}
      </div>
      {/* line-clamp-1 used to cut long titles mid-word ("The Godfather" ->
          "The...", "Apocalypse Now" -> "Apocalypse..."), which reads as
          broken rather than intentional -- especially in narrower grids
          like the profile page's Personal Pyramid podium. Two lines gives
          enough room for the vast majority of titles to render in full,
          and the rare title that still overflows now truncates after a
          whole word/line instead of mid-word. */}
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-tight">{title.name}</p>
      {reason && <p className="line-clamp-2 text-xs text-foreground-muted">{reason}</p>}
    </Link>
  );
}
