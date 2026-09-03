import Link from "next/link";
import Image from "@/components/ui/fade-image";

export interface IconicRole {
  titleId: string;
  titleName: string;
  /** A photo of this specific person tied to this specific production
      (TMDB's tagged_images, not a movie poster and not a generic
      real-life headshot) -- see getTmdbTaggedImages. */
  imageUrl: string;
  characterName: string;
}

/**
 * "Photos" of a person, reimagined as their most iconic roles: each tile
 * is an actual photo of THIS person from one of their productions,
 * captioned with the character they played there — e.g. a photo of Leo
 * on the Wolf of Wall Street set captioned "Jordan Belfort", not that
 * movie's poster and not just another paparazzi shot. Same
 * scrollable-rail pattern as the Discover genre filters (see
 * globals.css's .no-scrollbar). Links through to the movie page.
 */
export function PersonIconicRoles({ roles }: { roles: IconicRole[] }) {
  if (roles.length < 2) return null;

  return (
    <section className="mt-8 border-t border-border pt-8">
      <h2 className="mb-3 font-display text-lg italic text-accent">Iconic roles</h2>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
        {roles.map((role, i) => (
          <Link
            key={`${role.titleId}-${role.characterName}`}
            href={`/movie/${role.titleId}`}
            className="stagger-card group w-28 shrink-0 snap-start transition-transform duration-200 hover:-translate-y-1 sm:w-32"
            style={{ animationDelay: `${(i % 12) * 40}ms` }}
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
              {role.imageUrl && (
                <Image
                  src={role.imageUrl}
                  alt={`${role.titleName} — ${role.characterName}`}
                  fill
                  sizes="128px"
                  className="object-cover transition group-hover:opacity-80"
                />
              )}
            </div>
            <p className="mt-1.5 line-clamp-1 text-xs font-medium leading-tight group-hover:underline">
              {role.characterName}
            </p>
            <p className="line-clamp-1 text-[10px] leading-tight text-foreground-muted">{role.titleName}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
