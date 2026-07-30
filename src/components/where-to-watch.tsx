import Image from "@/components/ui/fade-image";
import type { WatchProviderOffer } from "@/lib/external/tmdb-watch-providers";

const OFFER_LABEL: Record<WatchProviderOffer["offerType"], string> = {
  subscription: "Stream on",
  rent: "Rent on",
  buy: "Buy on",
};

const OFFER_ORDER: WatchProviderOffer["offerType"][] = ["subscription", "rent", "buy"];

/**
 * "Where to watch" — the single most-requested thing Letterboxd has never
 * had: it tells you a film is great and stops there. See
 * tmdb-watch-providers.ts for the lazy fetch-on-view caching this reads.
 */
export function WhereToWatch({ offers }: { offers: WatchProviderOffer[] }) {
  if (offers.length === 0) {
    return (
      <div className="mt-6">
        <p className="mb-2 text-xs uppercase tracking-wide text-foreground-muted">Where to watch</p>
        <p className="text-sm text-foreground-muted">
          Not currently available to stream, rent, or buy in the US.
        </p>
      </div>
    );
  }

  const byType = new Map<WatchProviderOffer["offerType"], WatchProviderOffer[]>();
  for (const o of offers) {
    const list = byType.get(o.offerType) ?? [];
    // A provider can legitimately appear twice in TMDB's raw data (e.g. two
    // regional storefronts under the same name) — de-dupe within a bucket
    // so the row doesn't repeat the same logo.
    if (!list.some((existing) => existing.provider === o.provider)) list.push(o);
    byType.set(o.offerType, list);
  }

  return (
    <div className="mt-6">
      <p className="mb-2 text-xs uppercase tracking-wide text-foreground-muted">Where to watch</p>
      <div className="flex flex-col gap-3">
        {OFFER_ORDER.map((type) => {
          const list = byType.get(type);
          if (!list?.length) return null;
          return (
            <div key={type} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-foreground-muted">{OFFER_LABEL[type]}</span>
              {list.map((o) => (
                <a
                  key={o.provider}
                  href={o.url ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border border-border bg-surface-raised py-1 pl-1 pr-2.5 text-xs font-medium text-foreground hover:border-accent/50"
                >
                  {o.logoUrl && (
                    <span className="relative block h-5 w-5 overflow-hidden rounded-[var(--radius-sm)]">
                      <Image src={o.logoUrl} alt="" fill sizes="20px" />
                    </span>
                  )}
                  {o.provider}
                </a>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
