import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { DirectorOfTheDay as DirectorOfTheDayData } from "@/lib/director-of-day/fetch";

/**
 * Front-and-center backdrop card, matching SpotlightRecommendation's
 * fixed height so the two read as one paired row on the Solo home view
 * -- name anchored at the bottom on a gradient scrim over the
 * director's own photo, same treatment as the hero beside it. The
 * filmography rail the old square-headshot card used to lead into is
 * dropped here so the two cards stay exactly level; the discography is
 * still one tap away on the director's own /person page.
 */
export function DirectorOfTheDay({ director }: { director: DirectorOfTheDayData }) {
  return (
    <Link
      href={`/person/${director.id}`}
      className="group relative block h-[320px] overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised sm:h-[380px]"
    >
      {director.photoUrl && (
        <Image
          src={director.photoUrl}
          alt={director.name}
          fill
          className="object-cover object-top transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 1024px) 100vw, 30vw"
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Director of the day</p>
        <p className="font-display mt-1 text-lg text-foreground group-hover:underline sm:text-xl">{director.name}</p>
      </div>
    </Link>
  );
}
