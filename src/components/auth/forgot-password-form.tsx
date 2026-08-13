"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, null);

  return (
    <>
      <h1 className="font-display mb-1 text-2xl">Reset your password</h1>
      <p className="mb-6 text-sm text-foreground-muted">
        Enter the email on your account and we&apos;ll send a link to reset your password.
      </p>

      {state?.success ? (
        <p className="rounded-[var(--radius-md)] border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          If an account exists for that email, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <Input name="email" type="email" placeholder="Email" required autoComplete="email" />
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <Button type="submit" isLoading={pending} className="mt-2 w-full">
            Send reset link
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-foreground-muted">
        <Link href="/login" className="text-accent hover:underline">
          Back to login
        </Link>
      </p>
    </>
  );
}
