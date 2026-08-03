"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ANON_SWIPES_STORAGE_KEY } from "@/components/landing/taste-teaser";

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState(signUp, null);
  const [anonymousSwipes, setAnonymousSwipes] = useState<string>("");
  // Referral link (see src/components/settings/referral-card.tsx), e.g.
  // /signup?ref=abc1234 -- read via an effect off window.location rather
  // than next/navigation's useSearchParams(), which would force this
  // client-component page into a <Suspense> boundary just to read one
  // query param. Same "read once on mount" pattern as anonymousSwipes below.
  const [referralCode, setReferralCode] = useState<string>("");
  // Movie Night invite link (see src/app/movie-night/join/[token]/page.tsx),
  // e.g. /signup?mn=abc123xy -- same read-once-on-mount pattern as
  // referralCode above, carried through as a hidden field so signUp() can
  // join the new account to that movie night in the same request that
  // creates it, then redirect straight into the session instead of home.
  const [movieNightToken, setMovieNightToken] = useState<string>("");

  // Read once on mount — the landing page's taste teaser (if the visitor
  // went through it) writes swipes to this same key as they swipe. Carried
  // through as a hidden field so signUp() can seed the new account's
  // ratings/taste vector in the same request that creates it.
  //
  // Deliberately an effect + setState rather than a useState lazy
  // initializer: localStorage doesn't exist during SSR, so the initial
  // server-rendered HTML must be the empty string either way — reading it
  // in the initializer would make the client's first render diverge from
  // that SSR output and trigger a hydration mismatch. This is exactly the
  // "synchronize with an external system" case React's effect docs carve
  // out as legitimate, hence the rule suppression below.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnonymousSwipes(localStorage.getItem(ANON_SWIPES_STORAGE_KEY) ?? "");
    } catch {
      // Storage unavailable — sign up proceeds with no pre-seeded signal.
    }
    setReferralCode(new URLSearchParams(window.location.search).get("ref") ?? "");
    setMovieNightToken(new URLSearchParams(window.location.search).get("mn") ?? "");
  }, []);

  // Fires on every submit attempt, not just a successful one — but that's
  // fine: the hidden field's value already lives in React state by this
  // point, so a retry after a validation error (e.g. taken username)
  // still resubmits the same swipes. Once submitted, there's no reason to
  // keep them in localStorage; clearing here (rather than only on
  // confirmed success, which useActionState + a redirecting action can't
  // easily hook into) avoids a stale session's swipes silently attaching
  // to a much later, unrelated signup.
  function clearStoredSwipes() {
    try {
      localStorage.removeItem(ANON_SWIPES_STORAGE_KEY);
    } catch {
      // Storage unavailable — nothing to clear.
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="font-display mb-1 text-2xl">Create your account</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        We&apos;ll start learning your taste from your very first rating.
      </p>

      <form action={formAction} onSubmit={clearStoredSwipes} className="flex flex-col gap-3">
        <input type="hidden" name="anonymousSwipes" value={anonymousSwipes} />
        <input type="hidden" name="ref" value={referralCode} />
        <input type="hidden" name="mn" value={movieNightToken} />
        <Input name="username" placeholder="Username" required autoComplete="username" />
        <Input name="email" type="email" placeholder="Email" required autoComplete="email" />
        <Input name="password" type="password" placeholder="Password (8+ characters)" required autoComplete="new-password" />
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <Button type="submit" isLoading={pending} className="mt-2 w-full">
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-foreground-muted">
        By creating an account, you agree to Backlot&apos;s{" "}
        <Link href="/terms" className="text-accent hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-accent hover:underline">
          Privacy Policy
        </Link>
        .
      </p>

      <p className="mt-4 text-center text-sm text-foreground-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
