import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Copied literals rather than CSS custom properties -- Satori renders this
// route standalone and can't read globals.css (same constraint as every
// other opengraph-image.tsx in this app).
const GOLD = "#d9b876";
const BACKGROUND = "#0a0908";

/**
 * Branded preview card for a public list -- a stack of the list's own
 * posters is a much stronger click signal in a feed/DM than a generic
 * app icon, and costs nothing extra to build since list_items already
 * carries poster_url. See list-share-button.tsx and migration-free
 * reasoning in page.tsx (lists are live, not a frozen snapshot).
 */
export default async function ListShareImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: list }, { data: itemRows }] = await Promise.all([
    supabase.from("lists").select("title").eq("id", id).maybeSingle(),
    supabase
      .from("list_items")
      .select("titles(poster_url, name)")
      .eq("list_id", id)
      .order("position", { ascending: true })
      .limit(4),
  ]);

  const posters = (itemRows ?? [])
    .map((r) => (r as unknown as { titles: { poster_url: string | null; name: string } | null }).titles)
    .filter((t): t is { poster_url: string | null; name: string } => !!t?.poster_url);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundColor: BACKGROUND,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: GOLD, letterSpacing: 4, textTransform: "uppercase" }}>
          Slate · List
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 48, maxWidth: 1050 }}>{list?.title ?? "A Slate list"}</div>

          {posters.length > 0 ? (
            <div style={{ display: "flex", gap: 24, marginTop: 32 }}>
              {posters.map((p, i) => (
                // Satori renders this route outside Next's normal image
                // pipeline, so next/image can't be used here.
                <img
                  key={i}
                  src={p.poster_url ?? undefined}
                  alt={p.name}
                  width={220}
                  height={330}
                  style={{ borderRadius: 8, objectFit: "cover" }}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 30, color: "#9a8f86", marginTop: 20 }}>
              A curated list on Slate
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
