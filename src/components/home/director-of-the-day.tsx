import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { DirectorOfTheDay as DirectorOfTheDayData } from "@/lib/director-of-day/fetch";

// Four films, not the full discography rail -- reads as "a taste of
// their work" rather than a scrollable filmography.
const DISCOGRAPHY_TILE_COUNT = 4;

/**
 * Avatar bumped from 64px to 128px with a thin gold ring (the same
 * "this is a highlighted moment" ring language as the #1 favorite
 * podium tile) -- picked over a same-size bump-only or a square
 * editorial-photo treatment because it keeps the round shape already
 * used everywhere else in the app (nav, profile) while still reading as
 * a real size jump rather than a marginal one. Name, a short bio line,
 * and four small discography posters at their natural 2:3 size fill
 * out the rest of the card. Card height (and SpotlightRecommendation's,
 * so the two still match) was raised from 380px to 440px on desktop to
 * give the bigger avatar room without squeezing the discography row.
 *
 * Each poster carries a one-line title caption underneath it. Without
 * one there was no way to tell which film a tile actually was -- some
 * TMDB poster art reads as pure imagery with no visible title text, so
 * a mismatched or unfamiliar poster just looked like a formatting bug.
 * The caption also gives a text fallback for the (rare) case where
 * posterUrl is null, instead of an unlabeled empty tile.
 */
export function DirectorOfTheDay({ director }: { director: DirectorOfTheDayData }) {
  const films = director.titles.slice(0, DISCOGRAPHY_TILE_COUNT);

  return (
    <div className="flex h-[368px] flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-border-strong sm:h-[440px]">
      <Link href={`/person/${director.id}`} className="group flex items-center gap-4">
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border-2 border-accent bg-surface-raised">
          {director.photoUrl && (
            <Image
              src={director.photoUrl}
              alt={director.name}
              fill
              className="object-cover object-top"
              sizes="128px"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Director of the day</p>
          <p className="truncate text-lg font-medium text-foreground group-hover:underline">{director.name}</p>
        </div>
      </Link>

      {director.bio && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-foreground-muted">{director.bio}</p>
      )}

      {films.length > 0 && (
        <div className="mt-4 grid flex-1 grid-cols-4 gap-2.5">
          {films.map((title) => (
            <Link key={title.id} href={`/movie/${title.id}`} className="group flex min-w-0 flex-col gap-1">
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-raised">
                {title.posterUrl ? (
                  <Image
                    src={title.posterUrl}
                    alt={title.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="80px"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center p-1 text-center text-[9px] leading-tight text-foreground-muted">
                    {title.name}
                  </span>
                )}
              </div>
              <p className="truncate text-center text-[10px] leading-tight text-foreground-muted group-hover:text-foreground">
                {title.name}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
