import Link from "next/link";
import Image from "@/components/ui/fade-image";

export interface IconicRole {
  titleId: string;
  titleName: string;
  posterUrl: string | null;
  characterName: string;
}

/**
 * "Photos" of a person, reimagined as their most iconic roles rather than
 * generic real-life headshots: each tile is the poster art for one of
 * their higher-profile credits, captioned with the character name they
 * played there — e.g. Daniel Craig's tile reads "James Bond", not just
 * another paparazzi shot. Same scrollable-rail pattern as the Discover
 * genre filters (see globals.css's .no-scrollbar). Links through to the
 * movie page, matching the filmography grid below it.
 */
export function PersonIconicRoles({ roles }: { roles: IconicRole[] }) {
  if (roles.length < 2) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">Iconic roles</h2>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {roles.map((role, i) => (
          <Link
            key={`${role.titleId}-${role.characterName}`}
            href={`/movie/${role.titleId}`}
            className="stagger-card group w-28 shrink-0 transition-transform duration-200 hover:-translate-y-1 sm:w-32"
            style={{ animationDelay: `${(i % 12) * 40}ms` }}
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
              {role.posterUrl && (
                <Image
                  src={role.posterUrl}
                  alt={role.titleName}
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
