import { RatingStars } from "@/components/ui/rating-stars";
import type { circleFeed as CircleFeedType } from "@/lib/demo/home-demo-data";

export function CircleFeed({ items }: { items: typeof CircleFeedType }) {
  return (
    <div>
      <h3 className="font-display mb-3 text-lg">From your circle</h3>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.initial + item.name}
            className="flex gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-4"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-accent/40 bg-surface-raised text-xs font-medium text-accent">
              {item.initial}
            </div>
            <div className="flex-1">
              {item.kind === "rated" && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm">
                      <span className="font-medium">{item.name}</span> rated {item.titleName}
                    </p>
                    <RatingStars value={item.rating} size={12} />
                  </div>
                  <p className="font-display mt-1 italic text-foreground-muted">{item.quote}</p>
                  <div className="mt-2 flex gap-4 text-[11px] uppercase tracking-wider text-accent">
                    {item.reactions.map((r) => (
                      <span key={r.label}>
                        {r.label} &middot; {r.count}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {item.kind === "watched" && (
                <>
                  <p className="text-sm">
                    <span className="font-medium">{item.name}</span> watched {item.titleName}
                  </p>
                  <p className="font-display mt-1 italic text-foreground-muted">{item.quote}</p>
                  <div className="mt-2 flex gap-4 text-[11px] uppercase tracking-wider text-accent">
                    {item.reactions.map((r) => (
                      <span key={r.label}>
                        {r.label} &middot; {r.count}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {item.kind === "compatibility" && (
                <>
                  <p className="text-sm">
                    <span className="font-medium">{item.name}</span> and you are{" "}
                    <span className="text-accent">{item.compatibilityPercent}%</span> compatible
                  </p>
                  <p className="font-display mt-1 italic text-foreground-muted">{item.blurb}</p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
