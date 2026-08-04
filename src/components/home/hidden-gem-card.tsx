import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";
import { formatRuntime } from "@/lib/utils";

type Title = Database["public"]["Tables"]["titles"]["Row"];

/**
 * Fills the slot Director of the Day used to occupy next to
 * SpotlightRecommendation (same fixed height, so the two still pair as one
 * row) -- a single title that's both a strong taste match AND genuinely
 * obscure (see lib/recommendations/hidden-gem.ts for the exact bars),
 * framed as a deliberate discovery rather than just another ranked pick.
 */
export function HiddenGemCard({ title, matchPercent }: { title: Title; matchPercent: number }) {
  const year = title.release_date?.slice(0, 4);
  const meta = [year, formatRuntime(title.runtime_minutes)].filter(Boolean).join(" · ");
  const image = title.backdrop_url ?? title.poster_url;

  return (
    <Link
      href={`/movie/${title.id}`}
      className="flex h-[368px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface transition-colors hover:border-border-strong sm:h-[440px]"
    >
      <div className="relative h-[55%] w-full shrink-0 overflow-hidden bg-surface-raised">
        {image && (
          <Image
            src={image}
            alt={title.name}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 40vw"
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-surface to-transparent" />
        <span className="absolute left-3 top-3 rounded-full border border-accent/40 bg-background/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-accent">
          Hidden gem
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-lg font-medium text-foreground">{title.name}</p>
        {meta && <p className="mt-0.5 text-xs uppercase tracking-wider text-foreground-muted">{meta}</p>}
        <span className="mt-2 inline-flex w-fit rounded-[var(--radius-full)] border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          {matchPercent}% match
        </span>
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-foreground-muted">
          A close match to your taste, but flying under the radar — barely anyone&apos;s rated it yet.
        </p>
      </div>
    </Link>
  );
}
