import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import type { TeaserPick } from "@/lib/actions/landing-teaser";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Copied literals rather than CSS custom properties -- same constraint as
// wrapped/share/[id]/opengraph-image.tsx: Satori renders this route
// standalone and can't read globals.css.
const GOLD = "#d9b876";
const BACKGROUND = "#0a0908";

/**
 * Branded preview card for a shared taste-teaser result. Growth audit
 * finding: this was the single highest-intent unauthenticated moment in
 * the app with zero share affordance -- see shareTeaserResult() in
 * landing-teaser.ts and migration 0082 for the rest of this loop.
 */
export default async function TeaserShareImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: share } = await supabase.from("teaser_shares").select("picks").eq("id", id).maybeSingle();
  const picks = (share?.picks as unknown as TeaserPick[] | undefined) ?? [];

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
          Slate · Taste Teaser
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 48, maxWidth: 1050 }}>Here&apos;s what Slate picked for them</div>

          {picks.length > 0 ? (
            <div style={{ display: "flex", gap: 32, marginTop: 32 }}>
              {picks.slice(0, 3).map((p) => (
                <div key={p.id} style={{ display: "flex", flexDirection: "column", width: 220 }}>
                  {p.posterUrl && (
                    // Satori renders this route outside Next's normal image
                    // pipeline, so next/image can't be used here.
                    <img
                      src={p.posterUrl}
                      alt={p.name}
                      width={220}
                      height={330}
                      style={{ borderRadius: 8, objectFit: "cover" }}
                    />
                  )}
                  <div style={{ display: "flex", fontSize: 20, marginTop: 12, color: "#c9beb3" }}>{p.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 30, color: "#9a8f86", marginTop: 20 }}>
              Take the 20-second taste test
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
