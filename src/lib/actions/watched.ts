"use server";

import { createClient } from "@/lib/supabase/server";
import { WATCHED_PAGE_SIZE } from "@/lib/constants/catalogue";
import type { Database } from "@/lib/supabase/types";
import type { MediaType } from "@/lib/context/media-type-cookie";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export interface WatchedRow {
  score: number;
  title: Title;
}

/**
 * Powers the "Load more" button on /profile/[username]/watched. The
 * profile page itself only ever renders the 12 most recent ratings (a
 * deliberate teaser, not a full list) — this page/action is the actual
 * complete, paginated history, which became a real gap once bulk Letterboxd
 * imports could land 50+ ratings in one go with nowhere to see them all.
 *
 * `username` is always a resolved concrete username by the time this is
 * called (the page itself resolves "me" -> the viewer's own username
 * server-side before rendering), so no special-casing needed here.
 */
export async function loadMoreWatchedTitles(
  username: string,
  mediaType: MediaType,
  page: number
): Promise<{ rows: WatchedRow[]; hasMore: boolean }> {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  if (profileError) console.error("[getWatchedPage] profile lookup", profileError.message);
  if (!profile) return { rows: [], hasMore: false };

  const from = (page - 1) * WATCHED_PAGE_SIZE;
  const to = from + WATCHED_PAGE_SIZE - 1;
  // Secondary sort on id: a bulk import (Letterboxd, etc.) can insert dozens
  // of rows with the same created_at timestamp, and ORDER BY on a non-unique
  // key alone doesn't guarantee a stable row order across separate paged
  // queries — without a tiebreaker, "Load more" could theoretically skip or
  // repeat rows within a tied batch. titles!inner + eq("titles.type", ...)
  // scopes this to the active Movies/Shows toggle -- see watched/page.tsx's
  // doc comment for why this was a real gap, not just this action's own
  // pagination but the page's own first-load query too.
  const { data, error } = await supabase
    .from("ratings")
    .select("score, titles!inner(*)")
    .eq("user_id", profile.id)
    .eq("titles.type", mediaType)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);
  if (error) console.error("[getWatchedPage] ratings lookup", error.message);

  const rows = (data ?? [])
    .map((r) => {
      const title = (r as unknown as { titles: Title | null }).titles;
      return title ? { score: r.score, title } : null;
    })
    .filter((r): r is WatchedRow => r !== null);

  return { rows, hasMore: rows.length === WATCHED_PAGE_SIZE };
}
