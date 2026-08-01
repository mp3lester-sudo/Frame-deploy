import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { DirectorOfTheDay as DirectorOfTheDayData } from "@/lib/director-of-day/fetch";

// Four films, not the full discography rail -- reads as "a taste of
// their work" rather than a scrollable filmography.
const DISCOGRAPHY_TILE_COUNT = 4;

/**
 * Toned-down from the full-bleed backdrop-photo version: a round avatar
 * sized just under the settings page's own "profile picture" (72px) --
 * bigger than a byline avatar, still nowhere near a face filling the
 * card -- plus name, a short bio line, and four small discography
 * posters at their natural 2:3 size (not stretched to fill the card,
 * unlike the previous six-tile grid). Still matches
 * SpotlightRecommendation's fixed height and sits beside it in the same
 * paired row.
 */
export function DirectorOfTheDay({ director }: { director: DirectorOfTheDayData }) {
  const films = director.titles.slice(0, DISCOGRAPHY_TILE_COUNT);

  return (
    <div className="flex h-[320px] flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-border-strong sm:h-[380px]">
      <Link href={`/person/${director.id}`} className="group flex items-center gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-raised">
          {director.photoUrl && (
            <Image
              src={director.photoUrl}
              alt={director.name}
              fill
              className="object-cover object-top"
              sizes="64px"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Director of the day</p>
          <p className="truncate text-base font-medium text-foreground group-hover:underline">{director.name}</p>
        </div>
      </Link>

      {director.bio && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-foreground-muted">{director.bio}</p>
      )}

      {films.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {films.map((title) => (
            <Link
              key={title.id}
              href={`/movie/${title.id}`}
              className="group relative aspect-[2/3] overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised"
            >
              {title.posterUrl && (
                <Image
                  src={title.posterUrl}
                  alt={title.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="80px"
                />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
