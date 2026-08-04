import { createClient } from "@/lib/supabase/server";

export interface OnThisDayTitle {
  id: string;
  name: string;
  posterUrl: string | null;
  year: number | null;
}

const RESULT_LIMIT = 3;

/**
 * Real releases from the catalogue whose release_date falls on today's
 * calendar month/day, across any year -- grounded in the same TMDB
 * release_date data already stored on every title (see the
 * titles_on_this_day function, supabase/migrations/0048_daily_features.sql),
 * not a generated or invented "fact." Every one of the year's 366 possible
 * month/days has at least one match in the current ~36.5k-title catalogue,
 * so this essentially always has something to show; ties broken by
 * weighted_rating so the most notable release for today leads.
 */
export async function getOnThisDayTitles(): Promise<OnThisDayTitle[]> {
  const supabase = await createClient();
  const now = new Date();

  const { data } = await supabase.rpc("titles_on_this_day", {
    p_month: now.getUTCMonth() + 1,
    p_day: now.getUTCDate(),
    p_limit: RESULT_LIMIT,
  });

  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    posterUrl: t.poster_url,
    year: t.release_date ? Number(t.release_date.slice(0, 4)) : null,
  }));
}
