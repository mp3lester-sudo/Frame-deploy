"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/ui/fade-image";
import { rateTitle } from "@/lib/actions/social";
import { getOnboardingCompletionPicks, type OnboardingCompletionPick } from "@/lib/actions/onboarding";
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

type Phase = "swiping" | "loading" | "done";

export function OnboardingSwipe({ titles }: { titles: SwipeTitle[] }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("swiping");
  const [picks, setPicks] = useState<OnboardingCompletionPick[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const current = titles[index];
  const progress = ((index + 1) / titles.length) * 100;

  function finish() {
    setPhase("loading");
    startTransition(async () => {
      try {
        setPicks(await getOnboardingCompletionPicks());
      } catch {
        setPicks([]); // reveal screen still renders fine with an empty list
      }
      setPhase("done");
    });
  }

  function advance() {
    if (index + 1 >= titles.length) {
      finish();
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

  if (phase === "loading") {
    return (
      <div className="mx-auto flex h-72 max-w-sm items-center justify-center text-sm text-foreground-muted">
        Building your taste profile…
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mx-auto w-full max-w-md text-center">
        <p className="font-display text-xs font-semibold uppercase tracking-wide text-accent">
          Your taste profile is ready
        </p>
        {picks.length > 0 ? (
          <>
            <h1 className="mt-2 text-2xl font-semibold">Here&apos;s what we&apos;ve got so far</h1>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {picks.map((p) => (
                <div key={p.id}>
                  <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
                    {p.posterUrl && <Image src={p.posterUrl} alt={p.name} fill className="object-cover" />}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs font-medium">{p.name}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <h1 className="mt-2 text-2xl font-semibold">You&apos;re all set</h1>
        )}

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-gold-foil px-6 font-medium text-accent-foreground shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] hover:brightness-110"
        >
          Let&apos;s go
        </button>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-8 flex items-center justify-between">
        <span className="font-display text-xs font-semibold uppercase text-accent">Taste training</span>
        <div className="flex items-center gap-3">
          <span className="font-sans text-xs text-foreground-muted">
            {index + 1} / {titles.length}
          </span>
          <button
            type="button"
            disabled={isPending}
            onClick={finish}
            className="text-xs text-foreground-muted hover:underline disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>
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

      <h2 className="font-display text-2xl">{current.name}</h2>
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
