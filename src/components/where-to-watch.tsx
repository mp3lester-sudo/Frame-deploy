import Image from "@/components/ui/fade-image";
import { cn } from "@/lib/utils";
import type { WatchProviderOffer } from "@/lib/external/tmdb-watch-providers";

/**
 * TMDB's free watch-providers API only returns one combined JustWatch
 * "where to watch this title" link per region -- it's the same URL on
 * every provider's offer, so every logo pointed at the same generic
 * JustWatch page rather than the app the icon actually represents. This
 * maps TMDB's `provider_name` strings to that provider's own site/app so
 * tapping the Netflix logo goes to Netflix, not a JustWatch redirect page.
 * Unrecognized providers fall back to the JustWatch link so nothing 404s.
 */
const PROVIDER_APP_URLS: Record<string, string> = {
  Netflix: "https://www.netflix.com/",
  "Netflix basic with Ads": "https://www.netflix.com/",
  "Netflix Standard with Ads": "https://www.netflix.com/",
  "Amazon Prime Video": "https://www.amazon.com/gp/video/storefront",
  "Amazon Video": "https://www.amazon.com/gp/video/storefront",
  "Prime Video": "https://www.amazon.com/gp/video/storefront",
  "Disney Plus": "https://www.disneyplus.com/",
  "Disney+": "https://www.disneyplus.com/",
  Hulu: "https://www.hulu.com/",
  Max: "https://www.max.com/",
  "HBO Max": "https://www.max.com/",
  "Apple TV": "https://tv.apple.com/",
  "Apple TV Plus": "https://tv.apple.com/",
  "Apple TV+": "https://tv.apple.com/",
  "Paramount Plus": "https://www.paramountplus.com/",
  "Paramount+": "https://www.paramountplus.com/",
  "Paramount+ Amazon Channel": "https://www.amazon.com/gp/video/storefront",
  Peacock: "https://www.peacocktv.com/",
  "Peacock Premium": "https://www.peacocktv.com/",
  Starz: "https://www.starz.com/",
  "Starz Amazon Channel": "https://www.amazon.com/gp/video/storefront",
  Showtime: "https://www.showtime.com/",
  "Showtime Amazon Channel": "https://www.amazon.com/gp/video/storefront",
  Crunchyroll: "https://www.crunchyroll.com/",
  fuboTV: "https://www.fubo.tv/",
  "Tubi TV": "https://tubitv.com/",
  Tubi: "https://tubitv.com/",
  "Pluto TV": "https://pluto.tv/",
  Vudu: "https://www.vudu.com/",
  "Fandango At Home": "https://www.fandangoathome.com/",
  "Google Play Movies": "https://play.google.com/store/movies",
  YouTube: "https://www.youtube.com/",
  "Microsoft Store": "https://www.microsoft.com/en-us/store/movies-and-tv",
  "AMC+": "https://www.amcplus.com/",
  "AMC Plus": "https://www.amcplus.com/",
  "AMC+ Amazon Channel": "https://www.amazon.com/gp/video/storefront",
  "BET+": "https://www.bet.plus/",
  "BET+ Amazon Channel": "https://www.amazon.com/gp/video/storefront",
  "MGM Plus": "https://www.mgmplus.com/",
  "MGM Plus Amazon Channel": "https://www.amazon.com/gp/video/storefront",
  "The Criterion Channel": "https://www.criterionchannel.com/",
  "Sundance Now": "https://www.sundancenow.com/",
  Shudder: "https://www.shudder.com/",
  "Shudder Amazon Channel": "https://www.amazon.com/gp/video/storefront",
  AcornTV: "https://www.acorn.tv/",
  "Acorn TV": "https://www.acorn.tv/",
  BritBox: "https://www.britbox.com/",
  "ESPN Plus": "https://www.espn.com/watch/espnplus/",
  "ESPN+": "https://www.espn.com/watch/espnplus/",
  Cinemax: "https://www.cinemax.com/",
  "Cinemax Amazon Channel": "https://www.amazon.com/gp/video/storefront",
  DIRECTV: "https://www.directv.com/",
  Redbox: "https://www.redbox.com/",
};

function getProviderAppUrl(provider: string, fallback: string | null): string | undefined {
  return PROVIDER_APP_URLS[provider] ?? fallback ?? undefined;
}

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
        {/* Redesign pass: logos default to a quiet grayscale treatment
            and only pick up their real brand color on hover -- a full
            row of six-plus saturated app icons (Netflix red, Disney+
            blue, Max purple...) reads as a generic app-store grid, at
            odds with the muted, editorial palette the rest of the page
            uses. Desaturating them by default lets the row sit quietly
            until someone's actually scanning it, same idea as a
            magazine's small monochrome "also available from" credit
            line rather than a row of app icons competing for attention
            with the poster above it. Border softened from a visible
            border/border-accent split to the shared glass-border token
            (with a faint accent wash on the highlighted subscription
            row) so this matches the rest of the page's hairline
            language instead of its own separate treatment. */}
        {providers.map((p) => (
          <a
            key={p.provider}
            href={getProviderAppUrl(p.provider, p.url)}
            target="_blank"
            rel="noopener noreferrer"
            title={p.provider}
            className={cn(
              "group relative block h-11 w-11 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)] transition-transform hover:scale-105 hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)]",
              highlight && "bg-accent/5"
            )}
          >
            {p.logoUrl ? (
              <Image
                src={p.logoUrl}
                alt={p.provider}
                fill
                sizes="44px"
                className="grayscale transition-[filter] duration-200 group-hover:grayscale-0"
              />
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
