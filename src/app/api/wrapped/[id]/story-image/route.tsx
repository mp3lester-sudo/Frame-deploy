import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import type { WrappedResult } from "@/lib/taste-dna/wrapped";

// Copied literals rather than CSS custom properties -- Satori renders
// outside Next's normal pipeline and can't read globals.css, same
// constraint as the opengraph-image.tsx routes.
const GOLD = "#d9b876";
const BACKGROUND = "#0a0908";

/**
 * Growth audit finding: Wrapped's only distribution path was a raw link,
 * but Wrapped was explicitly built in the Spotify-Wrapped pattern -- and
 * Wrapped's actual distribution channel is Instagram/Snapchat Stories,
 * which don't unfurl link previews at all. This renders a 1080x1920,
 * Stories-sized PNG of the same recap (same public wrapped_shares row the
 * opengraph-image route reads, no new backend) with Content-Disposition
 * set so the "Save image" button on the finale slide (see share-button.tsx)
 * downloads it directly rather than opening it in a new tab.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: share } = await supabase
    .from("wrapped_shares")
    .select("year, stats, profiles(username, display_name)")
    .eq("id", id)
    .maybeSingle();

  if (!share) return new Response("Not found", { status: 404 });

  const owner = (share as unknown as { profiles: { username: string; display_name: string | null } | null }).profiles;
  const ownerName = owner?.display_name ?? owner?.username ?? "A Slate user";
  const result = share.stats as unknown as WrappedResult;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 96,
          backgroundColor: BACKGROUND,
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 40, color: GOLD, letterSpacing: 6, textTransform: "uppercase" }}>
            Slate Wrapped
          </div>
          <div style={{ display: "flex", fontSize: 76, marginTop: 24, lineHeight: 1.1 }}>
            {ownerName}&apos;s {share.year}
          </div>
        </div>

        {result.favoriteTitle?.posterUrl && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders
                this route outside Next's normal image pipeline. */}
            <img
              src={result.favoriteTitle.posterUrl}
              alt={result.favoriteTitle.name}
              width={480}
              height={720}
              style={{ borderRadius: 16, objectFit: "cover" }}
            />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <Stat label="Films rated" value={String(result.totalRated)} />
          <Stat label="Hours watched" value={String(result.totalHours)} />
          {result.topGenres[0] && <Stat label="Top genre" value={result.topGenres[0].genre} />}
          {result.topArchetype && <Stat label="Archetype" value={result.topArchetype.name} />}
        </div>
      </div>
    ),
    { width: 1080, height: 1920 }
  );

  image.headers.set("Content-Disposition", `attachment; filename="slate-wrapped-${share.year}.png"`);
  return image;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <div style={{ display: "flex", fontSize: 30, color: "#9a8f86", textTransform: "uppercase", letterSpacing: 2 }}>
        {label}
      </div>
      <div style={{ display: "flex", fontSize: 44, color: GOLD }}>{value}</div>
    </div>
  );
}
