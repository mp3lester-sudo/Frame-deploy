"use client";

import { useState, useTransition } from "react";
import { changePassword } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Lets an already-logged-in user set a new password without leaving the
 * app -- the only other path to changing a password (requestPasswordReset
 * + updatePassword in lib/actions/auth.ts) requires a recovery email
 * round-trip, which is the wrong tool when you just want to rotate your
 * password proactively.
 */
export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await changePassword({ currentPassword, newPassword, confirmNewPassword });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-foreground-muted">
          Current password
        </label>
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-foreground-muted">
          New password
        </label>
        <Input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-foreground-muted">
          Confirm new password
        </label>
        <Input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          required
        />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" isLoading={isPending}>
          Change password
        </Button>
        {success && !isPending && <span className="text-xs text-accent">Password updated</span>}
      </div>
    </form>
  );
}
