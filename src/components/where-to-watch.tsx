import Image from "@/components/ui/fade-image";
import { cn } from "@/lib/utils";
import type { WatchProviderOffer } from "@/lib/external/tmdb-watch-providers";

/**
 * "Where to watch" — the single most-requested thing Letterboxd has never
 * had: it tells you a film is great and stops there. See
 * tmdb-watch-providers.ts for the lazy fetch-on-view caching this reads.
 *
 * Logo-grid presentation rather than a labeled pill per (provider, offer
 * type) pair — the same provider showing up under both "Rent" and "Buy"
 * with its full name repeated each time reads as cluttered and redundant
 * when, realistically, most titles have the exact same 5-7 storefronts in
 * both buckets. Subscription access is the one distinction worth calling
 * out on its own (it's already-paid-for vs. an extra purchase), so that's
 * the only row kept separate and visually set apart with an accent border.
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

  const streamProviders = dedupeByProvider(offers.filter((o) => o.offerType === "subscription"));
  const payProviders = dedupeByProvider(offers.filter((o) => o.offerType !== "subscription"));

  return (
    <div className="mt-6">
      <p className="mb-3 text-xs uppercase tracking-wide text-foreground-muted">Where to watch</p>
      <div className="flex flex-col gap-4">
        {streamProviders.length > 0 && (
          <ProviderRow label="Stream with your subscription" providers={streamProviders} highlight />
        )}
        {payProviders.length > 0 && <ProviderRow label="Rent or buy" providers={payProviders} />}
      </div>
    </div>
  );
}

function dedupeByProvider(offers: WatchProviderOffer[]): WatchProviderOffer[] {
  const seen = new Set<string>();
  const result: WatchProviderOffer[] = [];
  for (const o of offers) {
    if (seen.has(o.provider)) continue;
    seen.add(o.provider);
    result.push(o);
  }
  return result;
}

function ProviderRow({
  label,
  providers,
  highlight = false,
}: {
  label: string;
  providers: WatchProviderOffer[];
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-foreground-muted">{label}</p>
      <div className="flex flex-wrap gap-2.5">
        {providers.map((p) => (
          <a
            key={p.provider}
            href={p.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            title={p.provider}
            className={cn(
              "relative block h-11 w-11 shrink-0 overflow-hidden rounded-[var(--radius-md)] border bg-surface-raised transition-transform hover:scale-105 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)]",
              highlight ? "border-accent/50" : "border-border"
            )}
          >
            {p.logoUrl ? (
              <Image src={p.logoUrl} alt={p.provider} fill sizes="44px" />
            ) : (
              <span className="flex h-full items-center justify-center px-1 text-center text-[8px] leading-tight text-foreground-muted">
                {p.provider}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
