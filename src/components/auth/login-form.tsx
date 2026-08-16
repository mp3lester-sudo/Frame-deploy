"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, null);
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "success";
  const accountDeleted = searchParams.get("accountDeleted") === "true";

  return (
    <>
      <h1 className="font-display mb-1 text-2xl">Welcome back</h1>
      <p className="mb-6 text-sm text-foreground-muted">Log in to pick up where you left off.</p>

      {justReset && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          Password updated. Log in with your new password.
        </p>
      )}

      {accountDeleted && (
        <p className="mb-4 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm text-foreground-muted">
          Your account has been deleted.
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-3">
        <Input name="email" type="email" placeholder="Email" required autoComplete="email" />
        <Input name="password" type="password" placeholder="Password" required autoComplete="current-password" />
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-foreground-muted hover:text-accent">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" isLoading={pending} className="mt-2 w-full">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-foreground-muted">
        New to Slate?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
