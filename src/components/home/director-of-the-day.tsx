import Image from "@/components/ui/fade-image";
import Link from "next/link";
import type { DirectorOfTheDay as DirectorOfTheDayData } from "@/lib/director-of-day/fetch";

// A bio-length blurb, not the full multi-paragraph biography (see the
// person profile page for that) -- this card is a home page teaser, not
// the destination.
const BIO_PREVIEW_LENGTH = 150;

function bioPreview(bio: string | null): string | null {
  if (!bio) return null;
  const trimmed = bio.trim();
  if (trimmed.length <= BIO_PREVIEW_LENGTH) return trimmed;
  // Cut at the last whole word inside the limit rather than mid-word.
  const cut = trimmed.slice(0, BIO_PREVIEW_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : BIO_PREVIEW_LENGTH)}…`;
}

export function DirectorOfTheDay({ director }: { director: DirectorOfTheDayData }) {
  const preview = bioPreview(director.bio);

  return (
    <div>
      <h3 className="font-display mb-3 text-lg">Director of the Day</h3>
      <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-border-strong">
        <Link href={`/person/${director.id}`} className="flex items-center gap-4">
          {/* Bigger and deliberately left-anchored -- shrink-0 keeps it
              from being squeezed by a long name/bio next to it, and the
              row's items-center keeps it vertically balanced against
              however many lines the bio preview ends up wrapping to. */}
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full bg-surface-raised sm:h-32 sm:w-32">
            {director.photoUrl && (
              <Image
                src={director.photoUrl}
                alt={director.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 112px, 128px"
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-medium hover:underline">{director.name}</p>
            {preview && <p className="mt-1 line-clamp-3 text-xs text-foreground-muted">{preview}</p>}
          </div>
        </Link>

        {director.titles.length > 0 && (
          <div className="mt-4 flex gap-3">
            {director.titles.map((title) => (
              <Link
                key={title.id}
                href={`/movie/${title.id}`}
                className="group w-16 shrink-0 transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised">
                  {title.posterUrl && (
                    <Image
                      src={title.posterUrl}
                      alt={title.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="64px"
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
