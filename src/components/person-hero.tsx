import Image from "@/components/ui/fade-image";
import { BackButton } from "@/components/ui/back-button";

/**
 * Full-bleed backdrop hero for a person page -- same container pattern as
 * BackdropHero on the movie page (-mt-14 to extend under the nav's own
 * reserved space, object-cover object-top since a portrait-aspect source
 * cropped into a much wider box loses the most by centering, long
 * two-stop bottom fade so overlaid text reads cleanly the whole way up).
 * Replaces the earlier side-by-side "small portrait rectangle + name/bio"
 * layout, which was the one major page in the app with no hero moment at
 * all and plain gray section headers unlike everywhere else -- see
 * person/[id]/page.tsx's other components for the matching gold/italic
 * treatment applied to Iconic roles / Frequently works with / Filmography.
 *
 * Server component -- everything it needs (photo, name, birthday, place,
 * filmography-derived stats) comes straight from the DB query in
 * page.tsx, so unlike the old PersonHero this never has to wait on the
 * TMDB bio lookup. Bio now lives in its own PersonBio component streamed
 * in separately below (see person-bio.tsx) instead of being embedded
 * here -- keeping the hero itself paint-immediately.
 */
export function PersonHero({
  photoSrc,
  name,
  titleCount,
  activeSince,
}: {
  photoSrc?: string | null;
  name: string;
  /** Real count from the filmography query -- not fabricated. */
  titleCount: number;
  /** Earliest release year across this person's credited filmography, if
   *  derivable -- also real, not a guessed "years active" figure. */
  activeSince: number | null;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative -mt-14 h-[380px] w-full overflow-hidden sm:h-[520px]">
      {photoSrc ? (
        <Image src={photoSrc} alt="" fill priority sizes="100vw" className="object-cover object-top" />
      ) : (
        // No-photo fallback: same idea as the old initials circle, just
        // filling the full-bleed box instead of a small rounded rect.
        <div className="flex h-full w-full items-center justify-center bg-surface-raised">
          <span className="font-display text-8xl italic text-foreground-muted" aria-hidden="true">
            {initials}
          </span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background/45 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/75 to-transparent sm:h-64" />

      <div className="absolute left-3 top-[68px] z-10">
        <BackButton />
      </div>

      <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:px-6 sm:pb-8">
        <h1 className="font-display text-3xl italic text-foreground sm:text-5xl">{name}</h1>
        {/* Birthday/place aren't rendered here -- they come from the same
            TMDB bio lookup as the biography text (see PersonBio and
            PersonEnrichment in page.tsx), which is behind its own Suspense
            boundary so it doesn't block this hero's first paint. Showing
            them here would mean a raw, possibly-stale/empty DB read on a
            person's very first page view (before bio_checked_at is ever
            set -- see getOrFetchPersonBio), not the resolved TMDB value. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-soft">
            {titleCount} {titleCount === 1 ? "title" : "titles"}
          </span>
          {activeSince && (
            <span className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-soft">
              Since {activeSince}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
