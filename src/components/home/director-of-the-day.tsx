import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { DirectorOfTheDay as DirectorOfTheDayData } from "@/lib/director-of-day/fetch";

export function DirectorOfTheDay({ director }: { director: DirectorOfTheDayData }) {
  return (
    <div>
      <h3 className="font-display mb-3 text-lg">Director of the Day</h3>
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-border-strong">
        {/* Square headshot rather than the earlier circular avatar -- a
            face crop reads more like a film-still/poster treatment,
            which matches the filmography row it now leads into. */}
        <Link href={`/person/${director.id}`} className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-raised sm:h-28 sm:w-28">
            {director.photoUrl && (
              <Image
                src={director.photoUrl}
                alt={director.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 96px, 112px"
              />
            )}
          </div>
          <p className="text-lg font-medium hover:underline">{director.name}</p>
        </Link>

        {director.titles.length > 0 && (
          <div className="mt-4 flex gap-3">
            {director.titles.map((title) => (
              <Link
                key={title.id}
                href={`/movie/${title.id}`}
                className="group w-24 shrink-0 transition-transform duration-200 hover:-translate-y-1 sm:w-28"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised">
                  {title.posterUrl && (
                    <Image
                      src={title.posterUrl}
                      alt={title.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="112px"
                    />
                  )}
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] leading-tight text-foreground-muted">{title.name}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
