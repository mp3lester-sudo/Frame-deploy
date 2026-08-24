import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Copied literals rather than CSS custom properties -- same constraint as
// wrapped/share/[id]/opengraph-image.tsx: Satori renders this route
// standalone and can't read globals.css. Keep in sync by hand.
const GOLD = "#d9b876";
const BACKGROUND = "#0a0908";

/**
 * Branded preview card for a Movie Night invite link. Before this, pasting
 * an invite into a group chat produced a bare URL -- no name, no stakes, no
 * reason to tap -- because /movie-night/join/[token] had no metadata at
 * all (unlike movie/[id], profile/[username], and wrapped/share/[id],
 * which all already have this). This is the single highest-frequency,
 * highest-urgency share moment in the app (deciding what to watch *right
 * now*, in a group chat), so it's the first fix off the growth audit.
 *
 * Reuses the same anon-callable movie_night_preview RPC the join page
 * itself renders from (migration 0037) -- no new backend needed.
 */
export default async function MovieNightJoinImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: rows } = await supabase.rpc("movie_night_preview", { p_token: token });
  const preview = rows?.[0];

  const hostName = preview?.host_display_name ?? preview?.host_username ?? "A Slate user";
  const count = preview?.participant_count ?? 0;

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
          Slate · Movie Night
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 56, maxWidth: 1050 }}>{hostName} wants your pick</div>
          <div style={{ display: "flex", fontSize: 30, color: "#c9beb3", marginTop: 20 }}>
            {preview
              ? `${count} ${count === 1 ? "person is" : "people are"} deciding what to watch tonight`
              : "Join in and help pick something everyone's taste agrees on"}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
