import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/seo/site";

// Single, non-chunked sitemap. The catalogue (~36k titles as of writing)
// stays comfortably under the 50k-URL-per-sitemap convention, so there's
// no need for generateSitemaps() chunking here -- that would only be
// worth the added complexity once the catalogue is closer to that limit.
// This also means the URL matches what robots.ts already advertises
// (`${origin}/sitemap.xml`) instead of Next's chunked `/sitemap/[id].xml`
// convention, which requires its own (unneeded) index.
//
// PostgREST (Supabase's REST layer) caps every response at 1000 rows by
// default regardless of an explicit .limit() above that -- so pulling
// the full catalogue means paging through with .range() rather than a
// single big query.
const PAGE_SIZE = 1000;
const MAX_TITLES = 45_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();

  // Only public, indexable, non-viewer-specific routes -- everything
  // excluded here is also excluded in robots.ts (auth flows, settings,
  // messages, admin).
  const staticEntries: MetadataRoute.Sitemap = [
    "/",
    "/discover",
    "/hot-takes",
    "/clubs",
    "/privacy",
    "/terms",
    "/premium",
  ].map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.6,
  }));

  // A transient DB error at build time shouldn't fail the whole build --
  // worst case the sitemap is thin (static routes only) until the next
  // deploy picks up the titles.
  try {
    const supabase = createServiceRoleClient();
    const titleEntries: MetadataRoute.Sitemap = [];

    for (let offset = 0; offset < MAX_TITLES; offset += PAGE_SIZE) {
      const { data: page } = await supabase
        .from("titles")
        .select("id, updated_at")
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (!page || page.length === 0) break;

      for (const t of page) {
        titleEntries.push({
          url: `${origin}/movie/${t.id}`,
          lastModified: t.updated_at ?? undefined,
          changeFrequency: "monthly",
          priority: 0.5,
        });
      }

      if (page.length < PAGE_SIZE) break;
    }

    return [...staticEntries, ...titleEntries];
  } catch {
    return staticEntries;
  }
}
