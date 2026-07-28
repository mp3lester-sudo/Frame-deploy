"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { rateTitle } from "@/lib/actions/social";
import { formatRuntime } from "@/lib/utils";

export interface SwipeTitle {
  id: string;
  name: string;
  overview: string | null;
  posterUrl: string | null;
  year: string | null;
  director: string | null;
  runtimeMinutes: number | null;
  genres: string[];
}

const RATING_FOR = { not_for_me: 1, its_fine: 3, love_it: 5 } as const;

export function OnboardingSwipe({ titles }: { titles: SwipeTitle[] }) {
  const [index, setIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const current = titles[index];
  const progress = ((index + 1) / titles.length) * 100;

  function advance() {
    if (index + 1 >= titles.length) {
      router.push("/");
    } else {
      setIndex((i) => i + 1);
    }
  }

  function handleRate(score: number | null) {
    startTransition(async () => {
      if (score !== null) {
        try {
          await rateTitle({ titleId: current.id, score });
        } catch {
          // Non-fatal for onboarding — still advance so a single failed
          // write doesn't strand the user mid-flow.
        }
      }
      advance();
    });
  }

  if (!current) return null;

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-8 flex items-center justify-between">
        <span className="font-display text-xs font-semibold uppercase text-accent">Taste training</span>
        <span className="font-sans text-xs text-foreground-muted">
          {index + 1} / {titles.length}
        </span>
      </div>

      <div className="mb-8 h-1 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="relative mb-6 h-72 w-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-raised">
        {current.posterUrl ? (
          <Image src={current.posterUrl} alt={current.name} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-[10px] font-semibold uppercase tracking-widest text-foreground-muted">
            {current.name}
          </div>
        )}
      </div>

      <h1 className="font-display text-2xl">{current.name}</h1>
      <p className="mb-4 mt-1 text-xs uppercase tracking-wide text-foreground-muted">
        {[current.year, current.director, formatRuntime(current.runtimeMinutes), current.genres.join(", ")]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {current.overview && (
        <p className="font-display mb-8 italic leading-relaxed text-foreground-muted">{current.overview}</p>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleRate(RATING_FOR.not_for_me)}
          className="rounded-[var(--radius-sm)] border border-border bg-surface py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
        >
          Not for me
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleRate(RATING_FOR.its_fine)}
          className="rounded-[var(--radius-sm)] border border-border bg-surface py-3 text-xs font-medium uppercase tracking-wide text-foreground-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          It&apos;s fine
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleRate(RATING_FOR.love_it)}
          className="rounded-[var(--radius-sm)] bg-accent py-3 text-xs font-semibold uppercase tracking-wide text-accent-foreground disabled:opacity-50"
        >
          Love it
        </button>
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={() => handleRate(null)}
        className="w-full py-2 text-center font-sans text-xs text-foreground-muted disabled:opacity-50"
      >
        Haven&apos;t seen it — skip
      </button>
    </div>
  );
}
