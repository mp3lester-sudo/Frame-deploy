import { createServiceRoleClient } from "@/lib/supabase/server";
import { tmdbUrl } from "@/lib/external/tmdb-client";

/**
 * "Where to watch" — same lazy fetch-on-view caching pattern as RT scores
 * (rotten-tomatoes.ts) and person bios (tmdb-person.ts): the first movie
 * page view for a given title triggers a TMDB watch-providers lookup
 * (JustWatch data via TMDB's free API), the result is cached into
 * streaming_availability, and titles.streaming_checked_at is set — even on
 * a genuine miss — so subsequent views are a free DB read instead of
 * re-hitting TMDB. Region is hardcoded to US for now (same simplification
 * streaming_availability's schema already assumed with its default).
 */

const REGION = "US";

export interface WatchProviderLookupInput {
  id: string;
  tmdb_id: number | null;
  type: "movie" | "tv";
  streaming_checked_at: string | null;
}

export interface WatchProviderOffer {
  provider: string;
  logoUrl: string | null;
  offerType: "subscription" | "rent" | "buy";
  /** JustWatch's single combined link for the region — TMDB's free API
   *  doesn't expose a per-provider deep link, just one link per region. */
  url: string | null;
}

const OFFER_BUCKETS: { tmdbKey: "flatrate" | "rent" | "buy"; offerType: WatchProviderOffer["offerType"] }[] = [
  { tmdbKey: "flatrate", offerType: "subscription" },
  { tmdbKey: "rent", offerType: "rent" },
  { tmdbKey: "buy", offerType: "buy" },
];

export async function getOrFetchWatchProviders(title: WatchProviderLookupInput): Promise<WatchProviderOffer[]> {
  const supabase = createServiceRoleClient();

  if (title.streaming_checked_at) {
    const { data } = await supabase
      .from("streaming_availability")
      .select("provider, offer_type, url, logo_url")
      .eq("title_id", title.id)
      .eq("region", REGION);
    return (data ?? []).map((r) => ({
      provider: r.provider,
      logoUrl: r.logo_url,
      offerType: r.offer_type,
      url: r.url,
    }));
  }

  if (!title.tmdb_id) {
    // No TMDB id to look up against — mark checked so we don't retry forever.
    await supabase.from("titles").update({ streaming_checked_at: new Date().toISOString() }).eq("id", title.id);
    return [];
  }

  const path = title.type === "tv" ? `/tv/${title.tmdb_id}/watch/providers` : `/movie/${title.tmdb_id}/watch/providers`;

  let offers: WatchProviderOffer[] = [];
  try {
    const res = await fetch(tmdbUrl(path), {
      // Provider lineups shift occasionally but not daily — a day's
      // staleness is fine and keeps this well under any rate concerns.
      next: { revalidate: 86400 },
    });
    if (res.ok) {
      const data = await res.json();
      const region = data.results?.[REGION];
      if (region) {
        const link: string | null = region.link ?? null;
        for (const { tmdbKey, offerType } of OFFER_BUCKETS) {
          for (const p of region[tmdbKey] ?? []) {
            offers.push({
              provider: p.provider_name,
              logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : null,
              offerType,
              url: link,
            });
          }
        }
      }
    }
  } catch {
    // Network/API hiccup — don't cache, just retry next view.
    return [];
  }

  // Replace rather than upsert-merge: a title's provider lineup can shrink
  // (a service drops it) and there's no reliable way to tell "gone" from
  // "never existed" without diffing, so a clean slate per fetch is simplest.
  await supabase.from("streaming_availability").delete().eq("title_id", title.id).eq("region", REGION);
  if (offers.length) {
    await supabase.from("streaming_availability").insert(
      offers.map((o) => ({
        title_id: title.id,
        provider: o.provider,
        region: REGION,
        offer_type: o.offerType,
        url: o.url ?? undefined,
        logo_url: o.logoUrl ?? undefined,
      }))
    );
  }
  await supabase.from("titles").update({ streaming_checked_at: new Date().toISOString() }).eq("id", title.id);

  return offers;
}
