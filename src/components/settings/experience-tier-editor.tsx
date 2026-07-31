"use client";

import { useState, useTransition } from "react";
import { setExperienceTier } from "@/lib/actions/profile";
import { EXPERIENCE_TIERS, type ExperienceTier } from "@/lib/constants/experience-tier";
import { cn } from "@/lib/utils";

export function ExperienceTierEditor({ initialTier }: { initialTier: ExperienceTier | null }) {
  const [tier, setTier] = useState(initialTier);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handlePick(value: ExperienceTier) {
    if (value === tier) return;
    startTransition(async () => {
      await setExperienceTier(value);
      setTier(value);
      setSaved(true);
    });
  }

  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-foreground-muted">
        What kind of moviegoer are you?
      </label>
      <div className="grid grid-cols-3 gap-2">
        {EXPERIENCE_TIERS.map((t) => (
          <button
            key={t.value}
            type="button"
            disabled={isPending}
            onClick={() => handlePick(t.value)}
            className={cn(
              "rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
              tier === t.value
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {saved && !isPending && <span className="mt-1 inline-block text-xs text-accent">Saved</span>}
    </div>
  );
}
