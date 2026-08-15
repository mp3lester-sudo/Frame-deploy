import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { CreatorSpotlightData } from "@/lib/creator-spotlight/fetch";

// Mirrors director-of-the-day.tsx's card layout exactly (see that file
// for the full reasoning on sizing/photo treatment/caption choices) --
// only the label ("Showrunner of the day" vs "Director of the day") and
// data source differ.
const SHOWS_TILE_COUNT = 4;

export function CreatorSpotlight({ creator }: { creator: CreatorSpotlightData }) {
  const shows = creator.titles.slice(0, SHOWS_TILE_COUNT);

  return (
    <div className="flex h-[368px] flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-border-strong sm:h-[440px]">
      <Link href={`/person/${creator.id}`} className="group flex items-center gap-4">
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border-2 border-accent bg-surface-raised">
          {creator.photoUrl && (
            <Image
              src={creator.photoUrl}
              alt={creator.name}
              fill
              className="object-cover grayscale"
              sizes="128px"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Showrunner of the day</p>
          <p className="truncate text-lg font-medium text-foreground group-hover:underline">{creator.name}</p>
        </div>
      </Link>

      {creator.bio && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-foreground-muted">{creator.bio}</p>
      )}

      {shows.length > 0 && (
        <div className="mt-4 flex flex-1 flex-wrap justify-center gap-x-2.5 gap-y-3">
          {shows.map((title) => (
            <Link
              key={title.id}
              href={`/movie/${title.id}`}
              className="group flex w-[calc((100%-30px)/4)] min-w-[64px] shrink-0 flex-col gap-1"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-sm)] border border-border bg-surface-raised">
                {title.posterUrl ? (
                  <Image
                    src={title.posterUrl}
                    alt={title.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="120px"
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
