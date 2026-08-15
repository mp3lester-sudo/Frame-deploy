"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { MIN_SWIPES_FOR_TEASER } from "@/lib/recommendations/teaser";
import { sendWelcomeEmail } from "@/lib/email/resend";
import { generateReferralCode } from "@/lib/referrals/code";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { REFERRAL_BONUS_DAYS } from "@/lib/referrals/constants";
import { notify } from "@/lib/actions/notifications";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { getClientIp } from "@/lib/auth/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { captureServerError } from "@/lib/monitoring/sentry-server";

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
    // onConflict must name the real (user_id, title_id) unique constraint
    // explicitly -- without it PostgREST resolves conflicts against the
    // fresh-uuid primary key, which never matches, so this degraded to a
    // plain INSERT and threw on the real constraint for anyone who'd
    // swiped the same title twice pre-signup (or rated it during
    // onboarding before this ran) -- exactly the failure mode `continue`
    // below was meant to shrug off, except it was firing on legitimate
    // rows too, not just the "stale/deleted title id" case the comment
    // originally described.
    const { error } = await supabase
      .from("ratings")
      .upsert({ user_id: userId, title_id: titleId, score }, { onConflict: "user_id,title_id" });
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
  // IP-keyed (not user-keyed -- there's no user yet) since this endpoint is
  // exactly what mass bot signups target once a signup link gets real
  // visibility (a marketing push, going viral, etc). See getClientIp for
  // why IP is the only signal available pre-auth, and isRateLimited
  // (rate-limit.ts) for why this is Postgres-backed rather than an
  // in-memory counter -- Vercel doesn't guarantee the same serverless
  // instance handles consecutive requests. 5/hour is generous enough for a
  // shared household/office IP creating a few real accounts, tight enough
  // to blunt a scripted signup flood.
  if (await isRateLimited(`signup:${await getClientIp()}`, { maxRequests: 5, windowSeconds: 3600 })) {
    return { error: "Too many signup attempts from this network — try again in a bit" };
  }

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
  let movieNightRedirectId: string | null = null;
  if (data.user) {
    // Every account gets its own shareable referral code, generated here
    // (rather than a DB default/trigger) so a rare collision can just
    // retry with a fresh random code instead of failing the whole signup.
    // The "profiles are public" select policy (0002_rls.sql) means this
    // uniqueness check works pre-insert regardless of auth state.
    let referralCode = generateReferralCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: clash } = await supabase.from("profiles").select("id").eq("referral_code", referralCode).maybeSingle();
      if (!clash) break;
      referralCode = generateReferralCode();
    }

    // Resolves ?ref=CODE (see the hidden field on the signup form) to the
    // referring account, if any -- an unknown/stale/tampered code just
    // means no referrer, never a signup failure.
    const refCode = (formData.get("ref") as string | null)?.trim();
    let referredByProfileId: string | null = null;
    if (refCode) {
      const { data: referrer } = await supabase.from("profiles").select("id").eq("referral_code", refCode).maybeSingle();
      referredByProfileId = referrer?.id ?? null;
    }

    await supabase.from("profiles").insert({
      id: data.user.id,
      username,
      display_name: username,
      referral_code: referralCode,
      referred_by: referredByProfileId,
    });

    if (referredByProfileId) {
      // Service-role client: granting the *referrer's* bonus_premium_until
      // is a write to someone else's profile row, which the newly-created
      // user (the one actually running this action) has no RLS access to
      // otherwise. record_referral() is itself idempotent (unique
      // referred_id), so a retried request can't double-grant.
      createServiceRoleClient()
        .rpc("record_referral", {
          p_referrer_id: referredByProfileId,
          p_referred_id: data.user.id,
          p_bonus_days: REFERRAL_BONUS_DAYS,
        })
        .then(({ error }) => {
          if (error) console.error("record_referral failed:", error.message);
        });
    }

    seededSwipes = await claimAnonymousSwipes(supabase, data.user.id, formData.get("anonymousSwipes") as string | null);

    // Fire-and-forget: a missing RESEND_API_KEY or a transient send failure
    // should never block account creation, so this is deliberately not
    // awaited into the error path above. Still reported to Sentry so a
    // broken welcome-email pipeline doesn't go unnoticed indefinitely.
    sendWelcomeEmail(email, username).catch((err) => {
      void captureServerError(err, { action: "sendWelcomeEmail", email });
    });

    // Resolves ?mn=TOKEN (see the hidden field on the signup form, carried
    // from /movie-night/join/[token]) -- an unknown/stale/tampered token
    // just means no movie night to join, never a signup failure. Uses the
    // same authenticated `supabase` client as claimAnonymousSwipes above
    // (auth.signUp() already established this account's session), so the
    // "users join movie night as self" RLS policy (auth.uid() = user_id)
    // covers the insert -- resolve_movie_night_token only needs to be
    // security definer for the *lookup*, since this brand-new account
    // isn't a participant of anything yet.
    const mnToken = (formData.get("mn") as string | null)?.trim();
    if (mnToken) {
      const { data: rows } = await supabase.rpc("resolve_movie_night_token", { p_token: mnToken });
      const night = rows?.[0];
      if (night) {
        const { error: joinError } = await supabase
          .from("movie_night_participants")
          .insert({ movie_night_id: night.id, user_id: data.user.id });
        if (!joinError) {
          movieNightRedirectId = night.id;
          if (night.host_id !== data.user.id) {
            // Fire-and-forget -- see comments.ts's addComment for why.
            void notify(supabase, {
              recipientId: night.host_id,
              actorId: data.user.id,
              type: "movie_night_invite",
              refId: night.id,
            });
          }
        }
      }
    }
  }

  // Only skip the post-signup /onboarding quiz if the landing-page teaser
  // gave a real taste signal (same bar the teaser itself uses to decide
  // it has enough to show a reveal) — a couple of swipes before bailing
  // to "skip to signup" is too thin to trust, so onboarding still runs in
  // that case (excluding whatever was already swiped on) to deepen it.
  redirect(
    movieNightRedirectId
      ? `/movie-night/${movieNightRedirectId}`
      : seededSwipes >= MIN_SWIPES_FOR_TEASER
        ? "/"
        : "/onboarding"
  );
}

export async function signIn(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  // Defense in depth alongside Supabase Auth's own per-account brute-force
  // protection -- that's keyed on the email being attempted, so it doesn't
  // stop one IP spraying many different email/password combinations
  // (credential stuffing). 20/10min per IP is loose enough that a real
  // person fumbling their password a few times never sees this.
  if (await isRateLimited(`signin:${await getClientIp()}`, { maxRequests: 20, windowSeconds: 600 })) {
    return { error: "Too many login attempts from this network — try again in a few minutes" };
  }

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
  try {
    await supabase.auth.signOut();
  } catch (error) {
    // A corrupted/already-invalid session cookie (e.g. left over from an
    // earlier "sign out of all devices" on this same browser, or a stale
    // refresh token) can make the signOut() call itself throw instead of
    // resolving with a normal { error } result -- previously that turned
    // "Log out" into an opaque 500, stranding the user on the page they
    // were trying to leave. Whatever the underlying cause, the user
    // explicitly asked to log out and land on /login, so that's what
    // happens regardless of whether this call succeeded.
    console.error("signOut: auth.signOut() threw, redirecting to /login anyway", error);
  }
  redirect("/login");
}

/**
 * Signs out every session for this account, not just the current browser
 * -- supabase-js's { scope: "global" } revokes every refresh token tied to
 * the user, so any other logged-in device/browser gets kicked on its next
 * request. Lightweight stand-in for full session/device management (no UI
 * for listing individual sessions), but covers the actual use case: "I
 * think someone else is logged into my account" or "I forgot to log out
 * on a shared computer."
 */
export async function signOutEverywhere() {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch (error) {
    // See signOut() above -- never let a failed revoke strand the user on
    // the settings page instead of sending them to /login.
    console.error("signOutEverywhere: auth.signOut() threw, redirecting to /login anyway", error);
  }
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
  // This sends a real email through Resend on every call -- unlimited,
  // it's both an inbox-spam vector against whoever's email gets entered
  // and a way to burn through Resend's sending quota/reputation. Returns
  // the same generic success shape on the rate-limited path as everywhere
  // else in this function (see the doc comment below) so this can't be
  // used to distinguish "rate limited" from "email doesn't exist" either.
  if (await isRateLimited(`pwreset:${await getClientIp()}`, { maxRequests: 5, windowSeconds: 3600 })) {
    return { success: true };
  }

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

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmNewPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords don't match",
    path: ["confirmNewPassword"],
  });

/**
 * Password change for an already-logged-in user, distinct from
 * updatePassword() above (which only works inside the temporary session
 * from a recovery email). Re-verifies the CURRENT password via
 * signInWithPassword before calling updateUser() -- an active session
 * alone is enough for Supabase to accept a new password, but that would
 * let anyone who grabs a signed-in device (or a stolen session cookie)
 * lock the real owner out permanently with no proof they knew the old
 * password. Deliberately plain-object in/out (no useActionState/FormData)
 * to match this file's other settings-style actions like updateProfile.
 */
export async function changePassword(
  input: z.infer<typeof changePasswordSchema>
): Promise<{ error?: string; success?: boolean }> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await getVerifiedUser();
  if (!user?.email) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) return { error: "Current password is incorrect" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return { error: error.message };

  return { success: true };
}


/**
 * Resends the signup confirmation email for the current session's address
 * -- backs the non-blocking "verify your email" nudge in Settings
 * (verify-email-banner.tsx). Deliberately silent on failure (rate limits,
 * an already-verified address, transient send errors) since this is a
 * low-stakes convenience action, not a security control.
 */
export async function resendVerificationEmail(): Promise<{ error?: string; success?: boolean }> {
  const user = await getVerifiedUser();
  if (!user?.email) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
  if (error) return { error: error.message };

  return { success: true };
}

const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password to confirm"),
});

/**
 * Self-service account deletion (Settings -> "Delete account"). Re-verifies
 * the current password first, same reasoning as changePassword() above --
 * this is even more destructive, so the bar for proof-of-ownership is at
 * least as high.
 *
 * Deliberately does NOT call supabase.auth.admin.deleteUser() -- see the
 * comment on migration 0042_account_deletion.sql for why a hard delete of
 * the auth.users row is riskier here than it looks (the notifications
 * table's exact FK behavior toward profiles was never captured in this
 * repo's migrations). Instead:
 *   1. Anonymizes the profile row (username/display_name/bio/avatar_url)
 *      and stamps deleted_at, so nothing personally-identifying is left
 *      attached to it and search/discovery can exclude it going forward.
 *   2. Deletes rows that are unambiguously "this device/this person's own
 *      curation" and safe to remove outright (push subscriptions,
 *      favorite titles).
 *   3. Bans the auth user via the Auth admin API (ban_duration far in the
 *      future) so the account can never log in again, then revokes every
 *      existing session -- this achieves "the account is gone" without an
 *      irreversible, blast-radius-unknown cascading SQL delete.
 * Reviews, ratings, comments, and messages are left in place (now
 * attributed to an anonymized profile) rather than bulk-deleted, since
 * that content also belongs to the threads/clubs/conversations other
 * users are part of.
 */
export async function deleteAccount(
  input: z.infer<typeof deleteAccountSchema>
): Promise<{ error?: string }> {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const user = await getVerifiedUser();
  if (!user?.email) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) return { error: "Current password is incorrect" };

  const anonymizedUsername = `deleted_${user.id.slice(0, 8)}`;
  await supabase
    .from("profiles")
    .update({
      username: anonymizedUsername,
      display_name: null,
      bio: null,
      avatar_url: null,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
  await supabase.from("favorite_titles").delete().eq("user_id", user.id);

  // Service-role only past this point: banning a user and listing/revoking
  // their sessions are Auth admin operations, not something the user's own
  // session can do to itself via the anon/authenticated client.
  const admin = createServiceRoleClient();
  const { error: banError } = await admin.auth.admin.updateUserById(user.id, {
    ban_duration: "876000h", // ~100 years -- GoTrue has no permanent "forever" value
  });
  if (banError) {
    // Data is already anonymized above regardless, but a failed ban means
    // this "deleted" account can still authenticate -- a real gap for a
    // moderation-motivated deletion, not just an accidental one. Reported
    // to Sentry rather than left console-only so it doesn't go unnoticed.
    console.error("deleteAccount: failed to ban user", banError.message);
    await captureServerError(new Error(banError.message), { action: "deleteAccount.ban", userId: user.id });
  }

  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch (error) {
    // See signOut() above -- the account is already banned/anonymized at
    // this point, so the user must land on /login regardless of whether
    // this final signOut call itself succeeded.
    console.error("deleteAccount: auth.signOut() threw, redirecting to /login anyway", error);
  }
  redirect("/login?accountDeleted=true");
}
