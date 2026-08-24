"use client";

import { useState, useTransition } from "react";
import { setTasteTwinOptIn } from "@/lib/actions/social";
import { cn } from "@/lib/utils";

/**
 * Off by default -- nothing about this account is ever compared to anyone
 * else's taste until this is turned on, and even then only against mutual
 * follows who've also turned it on (see src/lib/social/taste-twin.ts).
 */
export function TasteTwinToggle({ initialOptIn }: { initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !optIn;
    setOptIn(next);
    startTransition(async () => {
      try {
        await setTasteTwinOptIn(next);
      } catch {
        setOptIn(!next);
      }
    });
  }

  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-foreground-muted">Taste twin</label>
      <p className="mb-2 text-xs text-foreground-muted">
        Find out if you and a mutual follow agree more than anyone else you know. Only ever compared against
        people who&apos;ve also turned this on.
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={toggle}
        className={cn(
          "rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
          optIn
            ? "border-accent bg-accent text-accent-foreground"
            : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
        )}
      >
        {optIn ? "Enabled — tap to turn off" : "Turn on"}
      </button>
    </div>
  );
}
