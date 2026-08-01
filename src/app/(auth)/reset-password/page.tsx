"use client";

import { useActionState } from "react";
import { updatePassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, null);

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="font-display mb-1 text-2xl">Set a new password</h1>
      <p className="mb-6 text-sm text-foreground-muted">Choose a new password for your account.</p>

      <form action={formAction} className="flex flex-col gap-3">
        <Input name="password" type="password" placeholder="New password" required autoComplete="new-password" />
        <Input
          name="confirmPassword"
          type="password"
          placeholder="Confirm new password"
          required
          autoComplete="new-password"
        />
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <Button type="submit" isLoading={pending} className="mt-2 w-full">
          Update password
        </Button>
      </form>
    </div>
  );
}
