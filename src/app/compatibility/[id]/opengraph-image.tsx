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
 * Branded preview card for a shared compatibility score. Naming both
 * people by name in the image itself (not just the page) is the actual
 * hook -- "You and Alex: 87%" reads as personal mail in a group chat, not
 * an ad, before the recipient has even clicked through. See migration
 * 0083 and src/lib/actions/compatibility.ts for the rest of this loop.
 */
export default async function CompatibilityShareImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: share } = await supabase
    .from("compatibility_shares")
    .select("viewer_name, other_name, percent, shared_genres")
    .eq("id", id)
    .maybeSingle();

  const viewerName = share?.viewer_name ?? "A Slate user";
  const otherName = share?.other_name ?? "a friend";
  const percent = share?.percent ?? 0;
  const genres = share?.shared_genres ?? [];

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
          Slate · Compatibility
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 44, maxWidth: 1050 }}>
            {viewerName} + {otherName}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 16 }}>
            <div style={{ display: "flex", fontSize: 140, color: GOLD, fontWeight: 700 }}>{percent}%</div>
            <div style={{ display: "flex", fontSize: 32, marginLeft: 20, color: "#c9beb3" }}>compatible</div>
          </div>
          {genres.length > 0 && (
            <div style={{ display: "flex", fontSize: 24, marginTop: 20, color: "#9a8f86" }}>
              Both love: {genres.slice(0, 3).join(", ")}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
