import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { DirectorOfTheDay as DirectorOfTheDayData } from "@/lib/director-of-day/fetch";

// Discography grid is 3 columns -- 6 tiles reads as "here's their work"
// without the card needing to grow past the hero's own fixed height.
const DISCOGRAPHY_TILE_COUNT = 6;

/**
 * Toned-down from the full-bleed backdrop-photo version: a small round
 * avatar + name (not a giant face filling the card), a short bio line,
 * and a discography grid filling the rest of the card -- back in line
 * with the original square-headshot-plus-filmography design, just with
 * the bio restored too. Still matches SpotlightRecommendation's fixed
 * height and sits beside it in the same paired row, but the photo no
 * longer dominates the card the way the backdrop treatment did.
 */
export function DirectorOfTheDay({ director }: { director: DirectorOfTheDayData }) {
  const films = director.titles.slice(0, DISCOGRAPHY_TILE_COUNT);

  return (
    <div className="flex h-[320px] flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-border-strong sm:h-[380px]">
      <Link href={`/person/${director.id}`} className="group flex items-center gap-3">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-surface-raised">
          {director.photoUrl && (
            <Image
              src={director.photoUrl}
              alt={director.name}
              fill
              className="object-cover object-top"
              sizes="44px"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Director of the day</p>
          <p className="truncate text-sm font-medium text-foreground group-hover:underline">{director.name}</p>
        </div>
      </Link>

      {director.bio && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground-muted">{director.bio}</p>
      )}

      {films.length > 0 && (
        <div className="mt-3 grid flex-1 auto-rows-fr grid-cols-3 gap-2">
          {films.map((title) => (
            <Link
              key={title.id}
              href={`/movie/${title.id}`}
              className="group relative h-full w-full overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised"
            >
              {title.posterUrl && (
                <Image
                  src={title.posterUrl}
                  alt={title.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="120px"
                />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
