import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rankFavoriteDirectors, type RatedTitleDirector } from "@/lib/director-of-day/pick";
import { sendPushToUser } from "@/lib/push/send-push";
import { captureServerError } from "@/lib/monitoring/sentry-server";

/**
 * "New from a director you love" -- personalization audit item #5. Every
 * other proactive touch a user gets today (re-engagement email, home
 * page's Director of the Day) is either generic or only ever shown on a
 * page they had to visit. This is the first genuinely event-driven,
 * personalized push: the catalogue gains a title from a director whose
 * films this specific user has consistently rated well, and they hear
 * about it without having to go looking.
 *
 * Deliberately reuses rankFavoriteDirectors from director-of-day/pick.ts
 * rather than inventing a separate "who's your favorite director" metric
 * -- the task this was scoped from explicitly calls for reusing Director
 * of the Day's own ranking as the trigger, and a user shouldn't be told
 * "you love this director" by one signal while the home page's own
 * Director of the Day card is quietly using a different one.
 */

// How large a director's top-N has to be for a newly added film to count
// as "from a director you love" -- deliberately much tighter than
// Director of the Day's SHORTLIST_SIZE (100), which exists purely to
// give a long, no-repeat daily rotation among directors this user likes
// at all. A push notification is a much stronger claim than a rotating
// home-page card, so this only fires for someone's genuine top tier.
export const FAVORITE_DIRECTOR_TOP_N = 5;

/**
 * Pure: does `directorId` land in this user's top FAVORITE_DIRECTOR_TOP_N
 * directors, given their full rating history and a title->director map?
 * Split out from the DB-wired orchestrator below purely so the actual
 * "is this really a favorite" decision is unit-testable without a
 * database.
 */
export function isFavoriteDirectorForUser(
  directorId: string,
  ratings: RatedTitleDirector[],
  directorByTitle: Map<string, { id: string; name: string }>,
  topN: number = FAVORITE_DIRECTOR_TOP_N
): boolean {
  const ranked = rankFavoriteDirectors(ratings, directorByTitle);
  return ranked.slice(0, topN).some((d) => d.id === directorId);
}

// --- DB-wired orchestrator -------------------------------------------

// How far back to look for "new" titles -- matches the daily cadence
// this runs on (piggybacked onto the reengagement cron tick, see
// api/cron/reengagement/route.ts), with a little slack so a slow or
// retried run never has a gap where a title's ingestion window falls
// between two ticks and gets missed entirely.
const DEFAULT_LOOKBACK_HOURS = 30;

// A "prior fan" of a director: rated at least one of their existing
// (non-brand-new) films this well. This only narrows the SQL-level
// candidate pool before the real check (isFavoriteDirectorForUser, which
// needs this user's FULL rating history) -- it does not by itself decide
// anyone is a fan, so it can be generous without over- or under-counting.
const FAN_RATING_THRESHOLD = 4;

// Safety cap, same reasoning as reengagement/campaign.ts's
// MAX_EMAILS_PER_RUN -- bounds a single cron tick's blast radius if the
// eligibility logic is ever wrong, rather than notifying an unbounded
// number of users in one run while that gets fixed.
const MAX_NOTIFICATIONS_PER_RUN = 200;

export interface FavoriteDirectorAlertSummary {
  newTitles: number;
  directorsWithNewTitles: number;
  candidateUsers: number;
  notified: number;
  errors: number;
}

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Finds titles added to the catalogue within the lookback window, groups
 * them by director, finds each director's existing fans, and -- for any
 * fan whose full rating history genuinely puts that director in their
 * top FAVORITE_DIRECTOR_TOP_N (not just "liked one of their movies") --
 * inserts a notification + best-effort push. Run daily, piggybacked onto
 * the reengagement cron tick (same reasoning that tick already uses to
 * piggyback prune_rate_limit_buckets: one more thing that needs to run
 * roughly daily and has no reason to be its own separate Vercel Cron
 * entry).
 *
 * Scoped to credit_type = 'director' only (not 'creator', TV's showrunner
 * analog -- that's Creator Spotlight's territory, not this feature's).
 */
export async function runFavoriteDirectorAlerts(
  lookbackHours: number = DEFAULT_LOOKBACK_HOURS
): Promise<FavoriteDirectorAlertSummary> {
  const supabase = createServiceRoleClient();
  const summary: FavoriteDirectorAlertSummary = {
    newTitles: 0,
    directorsWithNewTitles: 0,
    candidateUsers: 0,
    notified: 0,
    errors: 0,
  };

  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const { data: newTitles, error: newTitlesError } = await supabase
    .from("titles")
    .select("id, name, poster_url, created_at")
    .gte("created_at", cutoff);
  if (newTitlesError) {
    console.error("[favorite-director-alerts] new titles lookup", newTitlesError.message);
    return summary;
  }
  if (!newTitles?.length) return summary;
  summary.newTitles = newTitles.length;

  const newTitleIds = newTitles.map((t) => t.id);
  const newTitleById = new Map(newTitles.map((t) => [t.id, t]));

  const { data: newCredits, error: newCreditsError } = await supabase
    .from("title_credits")
    .select("title_id, person_id")
    .eq("credit_type", "director")
    .in("title_id", newTitleIds);
  if (newCreditsError) {
    console.error("[favorite-director-alerts] new credits lookup", newCreditsError.message);
    return summary;
  }

  // Group the newly-added titles by director.
  const newTitleIdsByDirector = new Map<string, Set<string>>();
  for (const c of newCredits ?? []) {
    if (!c.person_id) continue;
    const set = newTitleIdsByDirector.get(c.person_id) ?? new Set<string>();
    set.add(c.title_id);
    newTitleIdsByDirector.set(c.person_id, set);
  }
  summary.directorsWithNewTitles = newTitleIdsByDirector.size;

  for (const [directorId, directorNewTitleIds] of newTitleIdsByDirector) {
    try {
      const { data: allCredits, error: allCreditsError } = await supabase
        .from("title_credits")
        .select("title_id")
        .eq("credit_type", "director")
        .eq("person_id", directorId);
      if (allCreditsError) throw new Error(allCreditsError.message);

      const priorTitleIds = (allCredits ?? [])
        .map((c) => c.title_id)
        .filter((id) => !directorNewTitleIds.has(id));
      if (!priorTitleIds.length) continue; // brand-new director, no prior fans possible yet

      const { data: fanRatings, error: fanRatingsError } = await supabase
        .from("ratings")
        .select("user_id")
        .in("title_id", priorTitleIds)
        .gte("score", FAN_RATING_THRESHOLD);
      if (fanRatingsError) throw new Error(fanRatingsError.message);

      const candidateUserIds = [...new Set((fanRatings ?? []).map((r) => r.user_id))];
      summary.candidateUsers += candidateUserIds.length;

      for (const userId of candidateUserIds) {
        if (summary.notified >= MAX_NOTIFICATIONS_PER_RUN) return summary;

        const isFavorite = await checkIsGenuineFavorite(supabase, userId, directorId);
        if (!isFavorite) continue;

        for (const titleId of directorNewTitleIds) {
          const title = newTitleById.get(titleId);
          if (!title) continue;

          const notified = await notifyIfNotAlready(supabase, userId, titleId);
          if (notified) summary.notified++;
        }
      }
    } catch (e) {
      console.error("[favorite-director-alerts] director", directorId, "failed:", e);
      await captureServerError(e, { action: "runFavoriteDirectorAlerts", directorId });
      summary.errors++;
    }
  }

  return summary;
}

/**
 * Fetches this one candidate user's FULL rating history + the directors
 * behind every title they've rated, then runs the real
 * isFavoriteDirectorForUser check -- same shape as
 * director-of-day/fetch.ts's getDirectorOfTheDay, deliberately not
 * shared with it directly since that function also fetches bio/photo/
 * discography this job never uses.
 */
async function checkIsGenuineFavorite(
  supabase: ServiceClient,
  userId: string,
  directorId: string
): Promise<boolean> {
  const { data: ratings } = await supabase.from("ratings").select("title_id, score").eq("user_id", userId);
  if (!ratings?.length) return false;

  const titleIds = ratings.map((r) => r.title_id);
  const { data: directorCredits } = await supabase
    .from("title_credits")
    .select("title_id, person_id, people(id, name)")
    .eq("credit_type", "director")
    .in("title_id", titleIds);

  const directorByTitle = new Map<string, { id: string; name: string }>();
  for (const c of directorCredits ?? []) {
    const person = (c as unknown as { people: { id: string; name: string } | null }).people;
    if (!person) continue;
    directorByTitle.set(c.title_id, { id: person.id, name: person.name });
  }

  return isFavoriteDirectorForUser(
    directorId,
    ratings.map((r) => ({ titleId: r.title_id, score: Number(r.score) })),
    directorByTitle
  );
}

/**
 * Inserts the notification row + sends push, but only if this exact
 * (user, title) pairing hasn't already been notified -- guards against
 * double-notifying if a title's created_at falls inside two overlapping
 * cron ticks' lookback windows (deliberately generous, see
 * DEFAULT_LOOKBACK_HOURS). Mirrors the Stripe webhook's payment_failed
 * insert (system-generated, actor_id: null) but additionally respects
 * this user's own push preference for this type, since -- unlike
 * payment_failed -- this type is togglable (migration 0085).
 */
async function notifyIfNotAlready(supabase: ServiceClient, userId: string, titleId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("recipient_id", userId)
    .eq("type", "new_from_favorite_director")
    .eq("title_id", titleId)
    .maybeSingle();
  if (existing) return false;

  const { error: insertError } = await supabase.from("notifications").insert({
    recipient_id: userId,
    actor_id: null,
    type: "new_from_favorite_director",
    title_id: titleId,
  });
  if (insertError) {
    console.error("[favorite-director-alerts] notification insert", insertError.message);
    await captureServerError(insertError, { action: "notifyIfNotAlready", userId, titleId });
    return false;
  }

  try {
    const { data: pref } = await supabase
      .from("notification_preferences")
      .select("push_enabled")
      .eq("user_id", userId)
      .eq("type", "new_from_favorite_director")
      .maybeSingle();
    const pushEnabled = pref?.push_enabled !== false; // opt-out model, see migration 0043

    if (pushEnabled) {
      const { data: title } = await supabase.from("titles").select("name").eq("id", titleId).maybeSingle();
      await sendPushToUser(userId, {
        title: "New from a director you love",
        body: title?.name ? `${title.name} just hit Slate.` : "A new title just hit Slate.",
        url: `/movie/${titleId}`,
      });
    }
  } catch (pushErr) {
    // Best-effort -- same reasoning as every other push send site in this
    // app: a push failure should never undo the in-app notification row,
    // which is already the source of truth the user will see regardless.
    await captureServerError(pushErr, { action: "notifyIfNotAlready.push", userId, titleId });
  }

  return true;
}
