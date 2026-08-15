"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { captureServerError } from "@/lib/monitoring/sentry-server";
import { z } from "zod";

async function requireUser() {
  const supabase = await createClient();
  const user = await getVerifiedUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// "Don't recommend again" -- see migration 0066_title_dismissals.sql for why
// this is its own table rather than a fake low rating. Read side lives in
// engine.ts (excluded from the candidate pool before scoring, same spot
// ratedTitleIds/watch_history already get excluded).
// ---------------------------------------------------------------------------

export async function dismissRecommendation(titleId: string) {
  const { titleId: id } = z.object({ titleId: z.string().uuid() }).parse({ titleId });
  const { supabase, user } = await requireUser();

  // onConflict must name the real (user_id, title_id) unique constraint --
  // without it PostgREST resolves against the fresh-uuid primary key,
  // which never matches, so dismissing a title that's already dismissed
  // (a repeat left-swipe on a title already excluded but still in a
  // stale client-side deck) threw on the real constraint instead of
  // being the harmless no-op it should be. Same bug class as
  // rateTitle/addToWatchlist/setSeasonRating, found while auditing those.
  const { error } = await supabase
    .from("title_dismissals")
    .upsert({ user_id: user.id, title_id: id }, { onConflict: "user_id,title_id" });
  // The swipe deck calls this fire-and-forget (void dismissRecommendation(...))
  // with no UI feedback on failure -- deliberately, see the comment below on
  // why there's no revalidation to hang an error state off of either. That
  // silence is fine for a slow network blip, but a genuine write failure
  // (e.g. a broken RLS policy) would otherwise be completely invisible: no
  // error surfaced to the user, nothing logged, nothing in Sentry -- the
  // title would just keep quietly resurfacing forever with no trace of why.
  if (error) {
    console.error("[dismissRecommendation]", error.message);
    await captureServerError(error, { action: "dismissRecommendation", userId: user.id, titleId: id });
  }

  // Deliberately NOT revalidatePath("/discover") -- this fires on every
  // single left-swipe, and a Server Action's revalidatePath triggers a
  // soft refresh of the current route the moment it resolves. On a page
  // with a loading.tsx skeleton (Discover has one), that meant the whole
  // page visibly flashed back to its loading state after every swipe --
  // the reload the deck was supposed to avoid in the first place.
  // SwipeRecsCard already removes the dismissed title from its own local
  // deck state the instant you swipe, so there's nothing server-rendered
  // that needs to catch up mid-session; the exclusion just needs to be in
  // place the next time Discover is freshly loaded, which a plain
  // server-rendered navigation already guarantees without any explicit
  // revalidation.
}

// Not surfaced in the UI yet (no "undo" affordance on the swipe deck), but
// kept alongside dismissRecommendation rather than added later as a
// separate file -- mirrors add/removeFromWatchlist's pairing in lists.ts,
// and a "manage dismissed titles" settings row is the obvious next step if
// this feature sees real use.
export async function undoDismissRecommendation(titleId: string) {
  const { titleId: id } = z.object({ titleId: z.string().uuid() }).parse({ titleId });
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("title_dismissals")
    .delete()
    .eq("user_id", user.id)
    .eq("title_id", id);
  if (error) {
    console.error("[undoDismissRecommendation]", error.message);
    await captureServerError(error, { action: "undoDismissRecommendation", userId: user.id, titleId: id });
  }

  // Same reasoning as dismissRecommendation above -- no mid-session
  // revalidation needed.
}
