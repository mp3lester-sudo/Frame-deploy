import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendReengagementEmail, type ReengagementPick } from "@/lib/email/resend";

const INACTIVE_DAYS = 14;
const COOLDOWN_DAYS = 30;
// Safety cap: if the eligibility query is ever wrong, this bounds how many
// emails a single cron tick can send while that gets fixed, rather than
// blasting the whole user base in one run.
const MAX_EMAILS_PER_RUN = 200;

export interface ReengagementRunSummary {
  candidates: number;
  sent: number;
  skippedNoEmail: number;
  skippedNoPick: number;
  errors: number;
}

/**
 * Finds accounts inactive for INACTIVE_DAYS (see reengagement_candidates(),
 * migration 0036) not already emailed within COOLDOWN_DAYS, and sends each
 * one a personalized "come back" email via Resend. Run daily by
 * src/app/api/cron/reengagement/route.ts (Vercel Cron, see vercel.json).
 *
 * Deliberately doesn't reuse getRecommendationsForUser() (engine.ts) — that
 * function calls createClient(), which reads the request's auth cookie and
 * only ever works for "the currently logged-in user." This job has no
 * logged-in user and needs to look up recommendations for many *other*
 * users at once, so it goes straight at match_titles_for_user() with the
 * service-role client instead.
 */
export async function runReengagementCampaign(): Promise<ReengagementRunSummary> {
  const supabase = createServiceRoleClient();
  const summary: ReengagementRunSummary = { candidates: 0, sent: 0, skippedNoEmail: 0, skippedNoPick: 0, errors: 0 };

  const { data: candidates, error: candidatesError } = await supabase.rpc("reengagement_candidates", {
    p_inactive_days: INACTIVE_DAYS,
    p_cooldown_days: COOLDOWN_DAYS,
  });
  if (candidatesError) {
    console.error("reengagement_candidates RPC failed:", candidatesError.message);
    return summary;
  }

  const rows = candidates ?? [];
  summary.candidates = rows.length;

  for (const { user_id: userId } of rows.slice(0, MAX_EMAILS_PER_RUN)) {
    try {
      const [{ data: profile }, { data: tasteVector }] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", userId).maybeSingle(),
        // Re-engagement is a cron job with no active toggle to read (no
        // logged-in request/cookie) -- scoped to 'movie' since that's still
        // the overwhelming majority of both the catalogue and every
        // existing user's rating history post-TV-launch.
        supabase.from("taste_vectors").select("user_id").eq("user_id", userId).eq("media_type", "movie").maybeSingle(),
      ]);
      if (!profile) {
        summary.errors++;
        continue;
      }

      const pick = await pickForUser(supabase, userId, !!tasteVector);
      if (!pick) {
        summary.skippedNoPick++;
        continue;
      }

      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (!email) {
        summary.skippedNoEmail++;
        continue;
      }

      const result = await sendReengagementEmail(email, profile.username, pick);
      if (result.sent) {
        await supabase.from("profiles").update({ last_reengagement_email_at: new Date().toISOString() }).eq("id", userId);
        summary.sent++;
      } else {
        summary.errors++;
      }
    } catch (e) {
      console.error("reengagement email failed for", userId, e);
      summary.errors++;
    }
  }

  return summary;
}

async function pickForUser(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  hasTasteVector: boolean
): Promise<ReengagementPick | null> {
  if (hasTasteVector) {
    const { data: matches } = await supabase.rpc("match_titles_for_user", {
      p_user_id: userId,
      p_match_count: 1,
      p_media_type: "movie",
    });
    const topTitleId = matches?.[0]?.title_id;
    if (topTitleId) {
      const { data: title } = await supabase
        .from("titles")
        .select("name, release_date, poster_url")
        .eq("id", topTitleId)
        .maybeSingle();
      if (title) return toPick(title);
    }
  }

  // Cold-start fallback (no taste vector, or no unwatched match found):
  // the single highest-rated title in the catalogue. Not personalized, but
  // a reasonable minimum-viable nudge rather than skipping the email.
  const { data: popular } = await supabase
    .from("titles")
    .select("name, release_date, poster_url")
    .eq("type", "movie")
    .order("weighted_rating", { ascending: false, nullsFirst: false })
    .limit(1);
  if (popular && popular[0]) return toPick(popular[0]);

  return null;
}

function toPick(title: { name: string; release_date: string | null; poster_url: string | null }): ReengagementPick {
  return {
    name: title.name,
    year: title.release_date ? title.release_date.slice(0, 4) : null,
    posterUrl: title.poster_url,
  };
}
