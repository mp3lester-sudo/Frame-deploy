import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/seo/site";

const TITLES_PER_CHUNK = 10_000;
// Chunk id 0 is reserved for the static/marketing routes; movie pages
// start at chunk 1 so the id itself doesn't need a lookup to know which
// kind of sitemap it is.
const STATIC_CHUNK_ID = 0;

export async function generateSitemaps() {
  // Falls back to a single (empty) title chunk rather than throwing --
  // a transient DB error at build time shouldn't take down the whole
  // build; worst case the sitemap is thin until the next deploy.
  let count = 0;
  try {
    const supabase = createServiceRoleClient();
    const result = await supabase.from("titles").select("id", { count: "exact", head: true });
    count = result.count ?? 0;
  } catch {
    count = 0;
  }
  const titleChunks = Math.max(1, Math.ceil(count / TITLES_PER_CHUNK));
  return Array.from({ length: titleChunks + 1 }, (_, i) => ({ id: i }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();

  if (id === STATIC_CHUNK_ID) {
    // Only public, indexable, non-viewer-specific routes -- everything
    // excluded here is also excluded in robots.ts (auth flows, settings,
    // messages, admin).
    const staticPaths = ["/", "/discover", "/hot-takes", "/clubs", "/privacy", "/terms", "/premium"];
    return staticPaths.map((path) => ({
      url: `${origin}${path}`,
      changeFrequency: path === "/" ? "daily" : "weekly",
      priority: path === "/" ? 1 : 0.6,
    }));
  }

  const chunkIndex = id - 1;
  try {
    const supabase = createServiceRoleClient();
    const { data: titles } = await supabase
      .from("titles")
      .select("id, updated_at")
      .order("id", { ascending: true })
      .range(chunkIndex * TITLES_PER_CHUNK, chunkIndex * TITLES_PER_CHUNK + TITLES_PER_CHUNK - 1);

    return (titles ?? []).map((t) => ({
      url: `${origin}/movie/${t.id}`,
      lastModified: t.updated_at ?? undefined,
      changeFrequency: "monthly",
      priority: 0.5,
    }));
  } catch {
    return [];
  }
}
