import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { OnThisDayTitle } from "@/lib/on-this-day/fetch";

/** Renders nothing when no release in the catalogue happens to land on
 *  today's calendar month/day (rare given ~36.5k titles, but possible for
 *  a much smaller catalogue) rather than showing an empty box. */
export function OnThisDayCard({ titles }: { titles: OnThisDayTitle[] }) {
  if (!titles.length) return null;

  const today = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date());

  return (
    <div className="rounded-[var(--radius-xl)] border border-glass-border bg-glass shadow-[var(--glass-shadow)] backdrop-blur-[20px] p-5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-accent">On this day — {today}</p>
      <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        {titles.map((t) => (
          <Link key={t.id} href={`/movie/${t.id}`} className="group w-[96px] shrink-0 snap-start">
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)] border border-glass-border bg-surface-raised">
              {t.posterUrl && (
                <Image
                  src={t.posterUrl}
                  alt={t.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="96px"
                />
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-foreground group-hover:text-accent">{t.name}</p>
            {t.year && <p className="text-[10px] text-foreground-muted">{t.year}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
