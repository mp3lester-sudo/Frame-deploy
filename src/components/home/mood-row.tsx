import Image from "next/image";
import type { moodRow as MoodRowType } from "@/lib/demo/home-demo-data";

export function MoodRow({ items }: { items: typeof MoodRowType }) {
  return (
    <div>
      <h3 className="font-display mb-3 text-lg">More for tonight&apos;s mood</h3>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.title}>
            <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
              {item.posterUrl && (
                <Image
                  src={item.posterUrl}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, 288px"
                />
              )}
              <span className="absolute left-2 top-2 rounded-[var(--radius-sm)] bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent backdrop-blur-sm">
                {item.genreBadge}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium">{item.title}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-foreground-muted">
              {item.matchPercent}% match
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
