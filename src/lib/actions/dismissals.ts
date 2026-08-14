"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
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

  await supabase.from("title_dismissals").upsert({ user_id: user.id, title_id: id });

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

  await supabase.from("title_dismissals").delete().eq("user_id", user.id).eq("title_id", id);

  // Same reasoning as dismissRecommendation above -- no mid-session
  // revalidation needed.
}
