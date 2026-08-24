import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import { formatRuntime } from "@/lib/utils";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * Compact horizontal card -- a small poster thumbnail plus a couple of
 * text lines, not a full backdrop-image card. Used to be the same fixed
 * h-[368px]/h-[440px] height as RecommendationReveal so the two competed
 * as equal partners in a row; now it's deliberately small and quiet,
 * living in the demoted area below the hero pick instead of beside it,
 * so there's no question which recommendation the page wants you to
 * look at first. See page.tsx for where it's placed.
 */
export function HiddenGemCard({ title, matchPercent }: { title: Title; matchPercent: number }) {
  const year = title.release_date?.slice(0, 4);
  const meta = [year, formatRuntime(title.runtime_minutes)].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/movie/${title.id}`}
      className="bento-card flex items-center gap-3 p-3"
    >
      <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised">
        {title.poster_url && (
          <Image src={title.poster_url} alt={title.name} fill className="object-cover" sizes="48px" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-[var(--radius-sm)] border border-accent/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-accent">
            Hidden gem
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-accent">{matchPercent}% match</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-foreground">{title.name}</p>
        {meta && <p className="truncate text-[11px] uppercase tracking-wider text-foreground-muted">{meta}</p>}
        {typeof title.tmdb_vote_count === "number" && (
          <p className="mt-0.5 truncate text-[11px] text-foreground-muted">
            A close match, but only {title.tmdb_vote_count.toLocaleString()} ratings on record
          </p>
        )}
      </div>
    </Link>
  );
}
