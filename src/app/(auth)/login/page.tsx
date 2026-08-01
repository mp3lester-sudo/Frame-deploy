"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="font-display mb-1 text-2xl">Welcome back</h1>
      <p className="mb-6 text-sm text-foreground-muted">Log in to pick up where your Taste left off.</p>

      <form action={formAction} className="flex flex-col gap-3">
        <Input name="email" type="email" placeholder="Email" required autoComplete="email" />
        <Input name="password" type="password" placeholder="Password" required autoComplete="current-password" />
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <Button type="submit" isLoading={pending} className="mt-2 w-full">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-foreground-muted">
        New to Taste?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
