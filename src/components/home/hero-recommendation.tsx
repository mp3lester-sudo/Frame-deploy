import Image from "next/image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import { formatRuntime } from "@/lib/utils";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export function HeroRecommendation({
  title,
  reason,
  matchPercent,
  director,
}: {
  title: Title;
  reason: string;
  /** null for cold-start picks, where a match % would be meaningless. */
  matchPercent: number | null;
  director: string | null;
}) {
  const year = title.release_date?.slice(0, 4);
  const meta = [year, formatRuntime(title.runtime_minutes), director].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/movie/${title.id}`}
      className="block overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface transition-colors hover:border-border-strong"
    >
      <div className="relative flex aspect-[16/10] items-start justify-between bg-surface-raised p-4">
        {title.poster_url && (
          <Image
            src={title.poster_url}
            alt={title.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 576px"
          />
        )}
        {title.genres?.[0] && (
          <span className="relative rounded-[var(--radius-sm)] bg-background/70 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-accent backdrop-blur-sm">
            {title.genres[0]}
          </span>
        )}
        {matchPercent !== null && (
          <span className="relative rounded-[var(--radius-full)] border border-accent/50 bg-background/70 px-3 py-1 text-xs font-semibold text-accent backdrop-blur-sm">
            {matchPercent}% match
          </span>
        )}
      </div>

      <div className="p-5">
        <h2 className="font-display text-2xl">{title.name}</h2>
        {meta && (
          <p className="mt-1 text-[11px] uppercase tracking-wider text-foreground-muted">{meta}</p>
        )}
        <p className="font-display mt-4 border-l-2 border-accent pl-3 italic leading-relaxed text-foreground-muted">
          {reason}
        </p>
      </div>
    </Link>
  );
}
