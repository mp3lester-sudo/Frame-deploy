import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { pickThemeForMonth } from "./themes";
import { titleMatchesTheme, type ThemeMatchableTitle } from "./theme-match";
import { selectPicks } from "./select-picks";

type Title = Database["public"]["Tables"]["titles"]["Row"];
type Season = Database["public"]["Tables"]["game_pass_seasons"]["Row"];
type Client = SupabaseClient<Database>;

export type GamePassDayStatus = "watched" | "current" | "missed" | "locked";

export interface GamePassDay {
  dayNumber: number;
  title: Title;
  status: GamePassDayStatus;
}

export interface GamePassBoard {
  season: Season;
  days: GamePassDay[];
  completed: boolean;
  rewardGranted: boolean;
}

// Wide enough to give the taste-ranked pass a real shot at filling every
// day of a themed month without needing the popularity fallback, while
// staying cheap against a ~4k-title catalogue.
const TASTE_POOL_SIZE = 500;
const POPULARITY_POOL_SIZE = 1500;

function currentPeriodStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function daysInMonth(periodStart: string): number {
  const d = new Date(`${periodStart}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

async function getOrCreateCurrentSeason(supabase: Client): Promise<Season> {
  const periodStart = currentPeriodStart();
  const theme = pickThemeForMonth(new Date(`${periodStart}T00:00:00Z`));

  const { data, error } = await supabase.rpc("get_or_create_game_pass_season", {
    p_period_start: periodStart,
    p_day_count: daysInMonth(periodStart),
    p_theme_name: theme.name,
    p_theme_description: theme.description,
    p_theme_genres: theme.genres,
    p_theme_keywords: theme.keywords,
    p_theme_decade_min: theme.decadeMin,
    p_theme_decade_max: theme.decadeMax,
  });
  if (error || !data) throw new Error(`failed to get or create season: ${error?.message}`);
  return data;
}

async function getOrCreateEntry(supabase: Client, seasonId: string, userId: string): Promise<void> {
  const { data: existing } = await supabase
    .from("game_pass_entries")
    .select("id")
    .eq("season_id", seasonId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;

  // Ignore the error here — if two requests race to join at once, the
  // unique (season_id, user_id) constraint means only one insert wins and
  // the other harmlessly no-ops; either way an entry now exists.
  await supabase.from("game_pass_entries").insert({ season_id: seasonId, user_id: userId });
}

async function getOrGeneratePicks(
  supabase: Client,
  season: Season,
  userId: string
): Promise<{ day_number: number; title_id: string }[]> {
  const { data: existing } = await supabase
    .from("game_pass_picks")
    .select("day_number, title_id")
    .eq("season_id", season.id)
    .eq("user_id", userId)
    .order("day_number");
  if (existing && existing.length > 0) return existing;

  const theme = {
    genres: season.theme_genres,
    keywords: season.theme_keywords,
    decadeMin: season.theme_decade_min,
    decadeMax: season.theme_decade_max,
  };

  const { data: watched } = await supabase.from("watch_history").select("title_id").eq("user_id", userId);
  const watchedIds = new Set((watched ?? []).map((w) => w.title_id));

  const { data: tasteVector } = await supabase.from("taste_vectors").select("user_id").eq("user_id", userId).maybeSingle();

  let tasteRankedIds: string[] = [];
  if (tasteVector) {
    const { data: matches } = await supabase.rpc("match_titles_for_user", {
      p_user_id: userId,
      p_match_count: TASTE_POOL_SIZE,
      p_exclude_watched: true,
    });
    const candidateIds = (matches ?? []).map((m) => m.title_id);
    if (candidateIds.length) {
      const { data: rows } = await supabase
        .from("titles")
        .select("id, genres, tone, themes, mood_tags, release_date")
        .in("id", candidateIds);
      const byId = new Map((rows ?? []).map((r) => [r.id, r as ThemeMatchableTitle & { id: string }]));
      // Preserve match_titles_for_user's similarity order — it's already
      // ranked best-first, filtering doesn't need to re-sort.
      tasteRankedIds = candidateIds.filter((id) => {
        const row = byId.get(id);
        return row && titleMatchesTheme(row, theme);
      });
    }
  }

  const { data: popularTitles } = await supabase
    .from("titles")
    .select("id, genres, tone, themes, mood_tags, release_date")
    .order("tmdb_vote_count", { ascending: false })
    .limit(POPULARITY_POOL_SIZE);
  const popularityRankedIds = (popularTitles ?? [])
    .filter((t) => !watchedIds.has(t.id) && titleMatchesTheme(t, theme))
    .map((t) => t.id);

  const finalIds = selectPicks([tasteRankedIds, popularityRankedIds], season.day_count);
  if (finalIds.length === 0) return [];

  const rows = finalIds.map((title_id, i) => ({ season_id: season.id, user_id: userId, day_number: i + 1, title_id }));
  const { data: inserted, error } = await supabase.from("game_pass_picks").insert(rows).select("day_number, title_id");
  if (inserted) return inserted;

  // Race: someone else generated this user's picks between our existence
  // check and this insert (e.g. a double page load) — read back theirs.
  const { data: raceWinner } = await supabase
    .from("game_pass_picks")
    .select("day_number, title_id")
    .eq("season_id", season.id)
    .eq("user_id", userId)
    .order("day_number");
  if (raceWinner && raceWinner.length) return raceWinner;
  throw new Error(`failed to generate picks: ${error?.message}`);
}

export async function getGamePassBoard(userId: string): Promise<GamePassBoard> {
  const supabase = (await createClient()) as unknown as Client;

  const season = await getOrCreateCurrentSeason(supabase);
  await getOrCreateEntry(supabase, season.id, userId);
  const picks = await getOrGeneratePicks(supabase, season, userId);

  const titleIds = picks.map((p) => p.title_id);
  const { data: titleRows } = titleIds.length
    ? await supabase.from("titles").select("*").in("id", titleIds)
    : { data: [] as Title[] };
  const titleById = new Map((titleRows ?? []).map((t) => [t.id, t]));

  const { data: watched } = titleIds.length
    ? await supabase.from("watch_history").select("title_id").eq("user_id", userId).in("title_id", titleIds)
    : { data: [] as { title_id: string }[] };
  const watchedIds = new Set((watched ?? []).map((w) => w.title_id));

  // Recomputed server-side via SECURITY DEFINER functions rather than
  // trusted from any client state — see migration 0017.
  const { data: isComplete } = await supabase.rpc("check_and_complete_game_pass", {
    p_season_id: season.id,
    p_user_id: userId,
  });
  let rewardGranted = false;
  if (isComplete) {
    const { data: granted } = await supabase.rpc("grant_game_pass_reward", {
      p_season_id: season.id,
      p_user_id: userId,
    });
    rewardGranted = !!granted;
  }

  // Season is always the *current* month (getOrCreateCurrentSeason only
  // ever resolves to this month), so today's date-of-month lines up
  // directly with day_number.
  const todayDayNumber = new Date().getUTCDate();

  const days: GamePassDay[] = picks
    .map((p) => {
      const title = titleById.get(p.title_id);
      if (!title) return null;
      let status: GamePassDayStatus;
      if (watchedIds.has(p.title_id)) status = "watched";
      else if (p.day_number === todayDayNumber) status = "current";
      else if (p.day_number < todayDayNumber) status = "missed";
      else status = "locked";
      return { dayNumber: p.day_number, title, status };
    })
    .filter((d): d is GamePassDay => d !== null);

  return { season, days, completed: !!isComplete, rewardGranted };
}
