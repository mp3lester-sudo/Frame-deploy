"use server";

import { getVerifiedUser } from "@/lib/auth/verified-user";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateDailyTrivia } from "@/lib/daily-trivia/generate";

export type SubmitDailyTriviaResult = { isCorrect: boolean; correctIndex: number } | { error: string };

/**
 * Re-derives today's correct answer server-side from daily_trivia rather
 * than trusting anything the client sends about it -- the initial page
 * render only ever gives the client the question + options (see
 * lib/daily-trivia/generate.ts's toPublicTrivia), never the correct index,
 * so there's nothing to leak by having the client submit its guess here.
 * One answer per person per day: a repeat submit doesn't overwrite the
 * first one, it just returns whatever's already on file.
 */
export async function submitDailyTriviaAnswer(selectedIndex: number): Promise<SubmitDailyTriviaResult> {
  const user = await getVerifiedUser();
  if (!user) return { error: "not_authenticated" };

  const trivia = await getOrCreateDailyTrivia();
  if (!trivia) return { error: "no_trivia_today" };

  const supabase = await createClient();
  const isCorrect = selectedIndex === trivia.correctIndex;

  const { error } = await supabase.from("daily_trivia_responses").insert({
    user_id: user.id,
    date_key: trivia.dateKey,
    selected_index: selectedIndex,
    is_correct: isCorrect,
  });

  if (error) {
    // Most likely cause: already answered today (primary key conflict on
    // user_id + date_key) -- don't let a second submit flip their recorded
    // answer, just return what's actually on file.
    const { data: existing, error: existingError } = await supabase
      .from("daily_trivia_responses")
      .select("selected_index, is_correct")
      .eq("user_id", user.id)
      .eq("date_key", trivia.dateKey)
      .maybeSingle();
    if (existingError) console.error("[submitTriviaAnswer] existing lookup", existingError.message);
    if (existing) return { isCorrect: existing.is_correct, correctIndex: trivia.correctIndex };
    return { error: "submit_failed" };
  }

  return { isCorrect, correctIndex: trivia.correctIndex };
}
