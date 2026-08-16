import { createClient } from "@/lib/supabase/server";

// How many poster tiles the Ask Slate "poster wall" backdrop shows --
// enough to tile a dense multi-row grid across a full-height page (chat
// history included) without visibly repeating on typical viewports. Same
// "flush tile grid + one shared gradient" trick as the auth backdrop
// (see lib/auth/backdrop-posters.ts) and the profile banner collage,
// just a bigger count since this wall tiles the whole page rather than
// one row.
const POSTER_COUNT = 42;

/**
 * Poster tiles for the Ask Slate page's poster-wall backdrop -- the
 * catalogue's most popular titles, heavily dimmed behind the concierge
 * chat. Deliberately not personalized to the signed-in user's own taste:
 * this is set dressing (a wall of recognizable posters, not a
 * recommendation), and pulling from popularity keeps it dense and
 * familiar even for a brand-new account with no taste signal yet. Same
 * public-read titles query the auth backdrop and landing teaser already
 * use.
 */
export async function getAskSlatePosterWall(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("titles")
    .select("poster_url")
    .not("poster_url", "is", null)
    .order("popularity", { ascending: false })
    .limit(POSTER_COUNT);

  return (data ?? []).map((t) => t.poster_url).filter((url): url is string => !!url);
}
