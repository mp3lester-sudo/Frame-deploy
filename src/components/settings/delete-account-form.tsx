"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Two-step confirmation (open a panel, then type your password) rather
 * than a single button -- this is the one Settings action that can't be
 * undone by the user themselves afterward, so it deliberately asks for
 * more friction than everything else on the page.
 */
export function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-foreground-muted hover:text-danger hover:underline"
      >
        Delete account
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount({ currentPassword: password });
      // A success redirects server-side and never returns here -- this
      // branch only runs when deleteAccount() came back with an error.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-danger/40 bg-danger/5 p-3">
      <p className="text-xs text-foreground-muted">
        This permanently removes your profile info and disables sign-in. Your reviews and comments stay
        attached to an anonymized account so other people&apos;s threads aren&apos;t broken. This can&apos;t be undone.
      </p>
      <Input
        type="password"
        autoComplete="current-password"
        placeholder="Enter your password to confirm"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="ghost" isLoading={isPending} className="text-danger hover:bg-danger/10">
          Permanently delete my account
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-foreground-muted hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}
