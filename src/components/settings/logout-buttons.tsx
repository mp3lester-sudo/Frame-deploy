"use client";

import { useTransition } from "react";
import { signOut, signOutEverywhere } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

/**
 * Invokes signOut()/signOutEverywhere() from a client component via
 * useTransition/startTransition instead of a plain <form action={fn}>
 * binding -- mirroring the pattern already proven to work for
 * deleteAccount() in delete-account-form.tsx. A plain form-action binding
 * on a Server Component page was found to 500 on the redirect() inside
 * these actions (POST /settings -> "An error occurred in the Server
 * Components render", production digest only, no further detail
 * available without Vercel/Sentry log access) -- switching to this
 * client-invoked pattern, which is this codebase's own established
 * working template for an auth-mutating action that redirects, is the
 * fix. Deliberately still uses each action's own server-side redirect()
 * rather than a client-side navigation, same as deleteAccount: a success
 * redirects server-side and never returns here.
 */
export function LogoutButtons() {
  const [isSigningOut, startSignOut] = useTransition();
  const [isSigningOutEverywhere, startSignOutEverywhere] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="mt-8 w-full text-danger hover:bg-danger/10"
        isLoading={isSigningOut}
        onClick={() => startSignOut(async () => { await signOut(); })}
      >
        Log out
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="mt-2 w-full text-xs text-foreground-muted hover:bg-danger/10 hover:text-danger"
        isLoading={isSigningOutEverywhere}
        onClick={() => startSignOutEverywhere(async () => { await signOutEverywhere(); })}
      >
        Log out of all devices
      </Button>
    </>
  );
}
