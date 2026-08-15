"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";

/**
 * Optional per-season ratings (migration 0074) -- additive to the
 * existing whole-show rating in `ratings`, not a replacement. A user can
 * rate "Breaking Bad" as a whole via rateTitle() AND separately mark
 * season 4 three stars if they want to be that specific. Nothing here
 * feeds the taste vector, Wrapped, or Cinema Score -- those all keep
 * reading the whole-show rating exactly as before. Wiring season-level
 * signal into those systems is a deliberate follow-up, not part of this
 * feature's first pass (see the AskUserQuestion decision this was scoped
 * against: "Add optional per-season ratings").
 */

const setSchema = z.object({
  titleId: z.string().uuid(),
  seasonNumber: z.number().int().min(0),
  score: z.number().min(0.5).max(5),
});

export async function setSeasonRating(input: z.infer<typeof setSchema>) {
  const { titleId, seasonNumber, score } = setSchema.parse(input);
  const user = await getVerifiedUser();
  if (!user) throw new Error("Sign in to rate seasons");
  const supabase = await createClient();

  // Same upsert-without-onConflict bug as ratings/rateTitle: this
  // table's PK is a fresh gen_random_uuid(), not (user_id, title_id,
  // season_number), so without an explicit onConflict target every
  // re-rate of a season degraded to a plain INSERT and threw a raw
  // Postgres duplicate-key error against the real unique constraint
  // below instead of updating the existing score.
  const { error } = await supabase
    .from("season_ratings")
    .upsert(
      { user_id: user.id, title_id: titleId, season_number: seasonNumber, score },
      { onConflict: "user_id,title_id,season_number" }
    );
  if (error) throw new Error(error.message);

  revalidatePath(`/movie/${titleId}`);
}

const deleteSchema = z.object({
  titleId: z.string().uuid(),
  seasonNumber: z.number().int().min(0),
});

export async function deleteSeasonRating(input: z.infer<typeof deleteSchema>) {
  const { titleId, seasonNumber } = deleteSchema.parse(input);
  const user = await getVerifiedUser();
  if (!user) throw new Error("Sign in to rate seasons");
  const supabase = await createClient();

  const { error } = await supabase
    .from("season_ratings")
    .delete()
    .eq("user_id", user.id)
    .eq("title_id", titleId)
    .eq("season_number", seasonNumber);
  if (error) throw new Error(error.message);

  revalidatePath(`/movie/${titleId}`);
}

export async function getMySeasonRatings(titleId: string): Promise<Record<number, number>> {
  const user = await getVerifiedUser();
  if (!user) return {};
  const supabase = await createClient();

  const { data } = await supabase
    .from("season_ratings")
    .select("season_number, score")
    .eq("user_id", user.id)
    .eq("title_id", titleId);

  const byseason: Record<number, number> = {};
  for (const row of data ?? []) byseason[row.season_number] = Number(row.score);
  return byseason;
}
