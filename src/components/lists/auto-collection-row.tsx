import Link from "next/link";
import Image from "@/components/ui/fade-image";
import type { AutoCollection } from "@/lib/collections/auto-collections";

/**
 * "For you" auto-curated shelves -- not a real row in the lists table, so
 * no link target for the row itself (each poster links straight to its
 * own title instead). Visually distinct from the manual-list rows above
 * it via the accent-tinted "Auto" tag, so it never reads as something the
 * person created and might try to edit or delete.
 */
export function AutoCollectionRow({ collection }: { collection: AutoCollection }) {
  return (
    <div className="bento-card p-3">
      <div className="flex items-center gap-2">
        <span className="rounded-[var(--radius-sm)] border border-accent/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-accent">
          Auto
        </span>
        <p className="truncate text-sm font-medium text-foreground">Your best {collection.genre} picks</p>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {collection.titles.map((title) => (
          <Link
            key={title.id}
            href={`/movie/${title.id}`}
            className="w-16 shrink-0 transition-opacity hover:opacity-80"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-sm)] bg-surface-raised">
              {title.posterUrl && <Image src={title.posterUrl} alt={title.name} fill className="object-cover" sizes="64px" />}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
