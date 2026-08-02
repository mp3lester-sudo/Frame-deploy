"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { MIN_SWIPES_FOR_TEASER } from "@/lib/recommendations/teaser";
import { sendWelcomeEmail } from "@/lib/email/resend";

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
    applied++;
  }
  // One recompute after all swipes land, not one per swipe — recompute_taste_vector_for_user
  // (migration 0031) rebuilds the whole vector from every 4-5 star rating each
  // time, so calling it per-row here would just redo the same full scan
  // repeatedly for no benefit.
  if (applied > 0) {
    await supabase.rpc("recompute_taste_vector_for_user", { p_user_id: userId });
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

    // Fire-and-forget: a missing RESEND_API_KEY or a transient send failure
    // should never block account creation, so this is deliberately not
    // awaited into the error path above.
    sendWelcomeEmail(email, username).catch(() => {});
  }

  // Only skip the post-signup /onboarding quiz if the landing-page teaser
  // gave a real taste signal (same bar the teaser itself uses to decide
  // it has enough to show a reveal) — a couple of swipes before bailing
  // to "skip to signup" is too thin to trust, so onboarding still runs in
  // that case (excluding whatever was already swiped on) to deepen it.
  redirect(seededSwipes >= MIN_SWIPES_FOR_TEASER ? "/" : "/onboarding");
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

const forgotPasswordSchema = z.object({ email: z.string().email() });

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

/**
 * Derives the site origin from the incoming request's headers rather than
 * a hardcoded env var — this app has no NEXT_PUBLIC_SITE_URL configured,
 * and Vercel gives every branch/preview deploy its own hostname, so the
 * only origin that's reliably correct for the recovery-link redirect is
 * whatever the browser actually connected to.
 */
async function getOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Kicks off Supabase's built-in "forgot password" email. Always returns a
 * generic success message regardless of whether the email matches an
 * account -- confirming or denying that an email is registered is a user
 * enumeration leak, and Supabase's own API already declines to reveal
 * that distinction (resetPasswordForEmail doesn't error on an unknown
 * address), so this just mirrors that at the UI layer too.
 */
export async function requestPasswordReset(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a valid email" };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  return { success: true };
}

/**
 * Sets a new password for the currently-recovering session. Only works
 * when called with the temporary session Supabase establishes after the
 * user clicks their recovery-email link and /auth/callback exchanges the
 * code -- with no such session, updateUser() itself rejects the call.
 */
export async function updatePassword(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  redirect("/login?reset=success");
}
