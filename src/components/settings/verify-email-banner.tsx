"use client";

import { useState, useTransition } from "react";
import { resendVerificationEmail } from "@/lib/actions/auth";

/**
 * A gentle, dismissible nudge for accounts whose email was never
 * confirmed -- deliberately NOT a hard gate. Retroactively blocking
 * access for every already-unverified account in production would lock
 * out real users overnight for something they were never required to do
 * when they signed up, which is a much worse outcome than an unverified
 * inbox. This just makes the option to fix it visible and easy.
 */
export function VerifyEmailBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (dismissed) return null;

  return (
    <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-accent/30 bg-accent/5 p-4 text-sm">
      <div>
        <p className="font-medium">Verify your email</p>
        <p className="text-xs text-foreground-muted">
          {sent
            ? "Check your inbox for a new confirmation link."
            : "We haven't confirmed your email address yet."}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {!sent && (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await resendVerificationEmail();
                if (result.success) setSent(true);
              })
            }
            className="rounded-[var(--radius-md)] border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            Resend email
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-foreground-muted hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
