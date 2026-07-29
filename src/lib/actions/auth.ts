"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, and underscores only"),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

// Shape of the pre-signup landing-page swipes (see
// components/landing/taste-teaser.tsx + lib/recommendations/teaser.ts) —
// submitted as a hidden JSON field on the signup form so a brand-new
// account can be seeded with real taste signal in the same request that
// creates it, instead of starting from zero.
const anonSwipeSchema = z.array(
  z.object({ titleId: z.string().uuid(), score: z.number().min(0.5).max(5) })
).max(20);

export type AuthActionState = { error?: string } | null;

/**
 * Applies pre-signup landing-page swipes to a freshly created account —
 * same three writes as rateTitle() in actions/social.ts (rating,
 * watch_history, taste-vector fold), just done inline against the user id
 * we already have here rather than re-deriving "current user" from a
 * cookie that may not have fully round-tripped yet right after signUp().
 * Returns how many swipes were actually applied, so the caller can decide
 * whether to skip the post-signup onboarding quiz.
 */
async function claimAnonymousSwipes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rawSwipes: string | null
): Promise<number> {
  if (!rawSwipes) return 0;

  let swipes: z.infer<typeof anonSwipeSchema>;
  try {
    swipes = anonSwipeSchema.parse(JSON.parse(rawSwipes));
  } catch {
    return 0; // malformed/tampered input — never let this block account creation
  }
  if (swipes.length === 0) return 0;

  let applied = 0;
  for (const { titleId, score } of swipes) {
    const { error } = await supabase.from("ratings").upsert({ user_id: userId, title_id: titleId, score });
    if (error) continue; // e.g. a stale/deleted title id — skip, don't fail the whole batch
    await supabase.from("watch_history").upsert({ user_id: userId, title_id: titleId });
    await supabase.from("activity_events").insert({ user_id: userId, event_type: "rated", title_id: titleId });
    await supabase.rpc("upsert_taste_vector_from_rating", { p_user_id: userId, p_title_id: titleId, p_score: score });
    applied++;
  }
  return applied;
}

export async function signUp(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, password, username } = parsed.data;

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) {
    return { error: "That username is taken" };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) return { error: error.message };

  let seededSwipes = 0;
  if (data.user) {
    await supabase.from("profiles").insert({
      id: data.user.id,
      username,
      display_name: username,
    });

    seededSwipes = await claimAnonymousSwipes(supabase, data.user.id, formData.get("anonymousSwipes") as string | null);
  }

  // Already have real signal from the landing-page teaser — the post-signup
  // swipe quiz would be redundant (and home is now personalized instead of
  // a cold-start popularity fallback). Otherwise, same flow as before.
  redirect(seededSwipes > 0 ? "/" : "/onboarding");
}

export async function signIn(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
