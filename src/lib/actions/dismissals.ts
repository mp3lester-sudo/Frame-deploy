"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { revalidatePath } from "next/cache";
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

  // Discover's swipe deck reads this on next load; no other page currently
  // depends on dismissal state, so this is the only path worth revalidating.
  revalidatePath("/discover");
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

  revalidatePath("/discover");
}
