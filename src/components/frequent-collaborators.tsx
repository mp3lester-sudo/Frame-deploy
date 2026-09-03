import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { FrequentCollaborator } from "@/lib/people/collaborators";

/**
 * "Frequently works with" module on the person page -- discovery-depth-
 * audit rendition #3. See lib/people/collaborators.ts for the pure
 * ranking logic; this just renders it as a scroll-snap avatar row,
 * matching the same horizontal-scroll pattern the movie page's cast row
 * already uses (credits-row.tsx).
 */
export function FrequentCollaborators({ collaborators }: { collaborators: FrequentCollaborator[] }) {
  if (collaborators.length === 0) return null;

  return (
    <section className="mt-10 border-t border-border pt-8">
      <h2 className="mb-3 font-display text-lg italic text-accent">Frequently works with</h2>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1">
        {collaborators.map((c) => (
          <Link
            href={`/person/${c.personId}`}
            key={c.personId}
            className="flex w-20 shrink-0 snap-start flex-col items-center gap-1.5 text-center"
          >
            <Avatar name={c.personName} src={c.photoUrl} size={56} />
            <p className="line-clamp-2 text-xs leading-tight hover:underline">{c.personName}</p>
            <p className="line-clamp-1 text-[10px] leading-tight text-foreground-muted">
              {c.sharedTitleCount} titles together
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
