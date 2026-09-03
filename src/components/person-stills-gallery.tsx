import Image from "@/components/ui/fade-image";

/**
 * A horizontal strip of extra profile shots for a person, beyond the single
 * hero photo already shown in PersonHero — same "scrollable rail, no visible
 * scrollbar" pattern as the Discover genre filters (see globals.css's
 * .no-scrollbar). Renders nothing if TMDB has no additional images, which
 * is common for less-prominent crew.
 */
export function PersonStillsGallery({ images }: { images: string[] }) {
  if (images.length < 2) return null;

  return (
    <section className="mt-8 border-t border-border pt-8">
      <h2 className="mb-3 font-display text-lg italic text-accent">Photos</h2>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
        {images.map((src, i) => (
          <div
            key={src}
            className="stagger-card relative aspect-[2/3] w-28 shrink-0 snap-start overflow-hidden rounded-[var(--radius-md)] bg-surface-raised transition-transform duration-200 hover:-translate-y-1 sm:w-32"
            style={{ animationDelay: `${(i % 12) * 40}ms` }}
          >
            <Image src={src} alt="" fill sizes="128px" className="object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}
