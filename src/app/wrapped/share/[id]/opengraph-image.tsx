import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import type { WrappedResult } from "@/lib/taste-dna/wrapped";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori (next/og) renders this route standalone -- it can't read CSS
// custom properties from globals.css, so these are literal copies of
// --accent/--background (movie palette; this predates the TV palette
// split and Wrapped itself isn't per-media-type) that had drifted out of
// sync with the real tokens. Keep these in sync by hand if either token
// changes.
const GOLD = "#d9b876";
const BACKGROUND = "#0a0908";

/**
 * Branded preview card for the public share link — this is what actually
 * makes a Wrapped link "shareable": when someone pastes it into iMessage,
 * Twitter, or Discord, the platform fetches this route (no auth, no
 * cookies) to render the link preview, rather than a blank generic card.
 */
export default async function WrappedShareImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: share } = await supabase
    .from("wrapped_shares")
    .select("year, stats, profiles(username, display_name)")
    .eq("id", id)
    .maybeSingle();

  const owner = (share as unknown as { profiles: { username: string; display_name: string | null } | null } | null)
    ?.profiles;
  const ownerName = owner?.display_name ?? owner?.username ?? "A Marquee user";
  const result = share?.stats as unknown as WrappedResult | undefined;

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
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 28, color: GOLD, letterSpacing: 4, textTransform: "uppercase" }}>
            Marquee Wrapped
          </div>
          <div style={{ display: "flex", fontSize: 56, marginTop: 16, maxWidth: 1000 }}>
            {ownerName}&apos;s {share?.year ?? ""} Wrapped
          </div>
        </div>

        {result ? (
          <div style={{ display: "flex", gap: 48 }}>
            <Stat label="Films rated" value={String(result.totalRated)} />
            <Stat label="Hours watched" value={String(result.totalHours)} />
            {result.topGenres[0] && <Stat label="Top genre" value={result.topGenres[0].genre} />}
            {result.topArchetype && <Stat label="Archetype" value={result.topArchetype.name} />}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 32, color: "#9a8f86" }}>marquee</div>
        )}
      </div>
    ),
    { ...size }
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 40, color: GOLD }}>{value}</div>
      <div style={{ display: "flex", fontSize: 20, color: "#9a8f86", marginTop: 4, textTransform: "uppercase" }}>
        {label}
      </div>
    </div>
  );
}
