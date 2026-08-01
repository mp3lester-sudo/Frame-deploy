import { createClient } from "@/lib/supabase/server";

export interface LastTitleForFont {
  id: string;
  poster_url: string | null;
  poster_font: string | null;
  poster_font_checked_at: string | null;
}

/**
 * "Last movie reviewed and watched" — reviews and watch_history are separate
 * tables (see CLAUDE.md's schema notes) with no guarantee the same title is
 * both, so this compares the two most recent timestamps independently and
 * returns whichever title is more recent overall, falling back to
 * whichever table has an entry if the other is empty.
 */
export async function getLastReviewedOrWatchedTitle(userId: string): Promise<LastTitleForFont | null> {
  const supabase = await createClient();

  const [{ data: lastReview }, { data: lastWatch }] = await Promise.all([
    supabase
      .from("reviews")
      .select("created_at, titles(id, poster_url, poster_font, poster_font_checked_at)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("watch_history")
      .select("watched_at, titles(id, poster_url, poster_font, poster_font_checked_at)")
      .eq("user_id", userId)
      .order("watched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const reviewTitle = lastReview?.titles as unknown as LastTitleForFont | null;
  const watchTitle = lastWatch?.titles as unknown as LastTitleForFont | null;

  if (reviewTitle && watchTitle) {
    const reviewTime = lastReview?.created_at ? new Date(lastReview.created_at).getTime() : 0;
    const watchTime = lastWatch?.watched_at ? new Date(lastWatch.watched_at).getTime() : 0;
    return watchTime > reviewTime ? watchTitle : reviewTitle;
  }

  return reviewTitle ?? watchTitle ?? null;
}
