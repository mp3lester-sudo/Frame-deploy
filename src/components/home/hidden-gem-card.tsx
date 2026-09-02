import Image from "@/components/ui/fade-image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
    <Link href={`/movie/${title.id}`} className="flex items-center gap-3 py-3">
      <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised">
        {title.poster_url && (
          <Image src={title.poster_url} alt={title.name} fill className="object-cover" sizes="48px" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-gold-foil shrink-0 text-[10px] font-bold uppercase tracking-[0.14em]">Hidden gem</span>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
          {title.name}
          {meta && <span className="font-normal text-foreground-muted"> ({meta.split(" · ")[0]})</span>}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-foreground-muted">
          {matchPercent}% match
          {typeof title.tmdb_vote_count === "number" &&
            `, only ${title.tmdb_vote_count.toLocaleString()} ratings — most of your friends haven't found this one yet.`}
        </p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-foreground-muted" aria-hidden />
    </Link>
  );
}
