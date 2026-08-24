"use client";

import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import Link from "next/link";
import Image from "@/components/ui/fade-image";
import { formatRuntime } from "@/lib/utils";
import { getTasteTeaser, shareTeaserResult, type TeaserPick } from "@/lib/actions/landing-teaser";
import { MIN_SWIPES_FOR_TEASER, type AnonSwipe } from "@/lib/recommendations/teaser";
import type { DeckTitle } from "@/lib/catalogue/diverse-deck";
import { useToast } from "@/components/ui/toast";

/**
 * Pre-signup "taste teaser": an anonymous visitor swipes on a handful of
 * movies right on the landing page, and sees a handful of *real*
 * recommendations built from just those swipes before we ever ask for an
 * email — the "it already gets me" moment that makes signing up feel
 * worth it, rather than a leap of faith.
 *
 * Swipes are persisted to localStorage as they happen (not just at the
 * end) so that whatever signal exists — whether the visitor finishes the
 * whole deck or bails early via "skip to signup" — survives the jump to
 * /signup, where signUp() (see lib/actions/auth.ts) reads this same key
 * and seeds the new account's taste vector immediately.
 */

export const ANON_SWIPES_STORAGE_KEY = "frame_anon_swipes_v1";
const RATING_FOR = { not_for_me: 1, its_fine: 3, love_it: 5 } as const;

function persistSwipes(swipes: AnonSwipe[]) {
  try {
    localStorage.setItem(ANON_SWIPES_STORAGE_KEY, JSON.stringify(swipes));
  } catch {
    // Private browsing / storage disabled — non-fatal, just means the
    // signal won't survive the jump to /signup. Swiping still works.
  }
}

type Phase = "swiping" | "loading" | "results";

export function TasteTeaser({ deck }: { deck: DeckTitle[] }) {
  const [index, setIndex] = useState(0);
  const [swipes, setSwipes] = useState<AnonSwipe[]>([]);
  const [phase, setPhase] = useState<Phase>("swiping");
  const [picks, setPicks] = useState<TeaserPick[]>([]);
  const [isPending, startTransition] = useTransition();
  // Growth audit: the results screen below previously had no share
  // affordance at all -- see shareTeaserResult() and /t/[id] for the rest
  // of this loop. isSharing/shareLink are local to this results view only.
  const [isSharing, setIsSharing] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const { showToast } = useToast();

  function handleShareTeaser() {
    setIsSharing(true);
    startTransition(async () => {
      const result = await shareTeaserResult(picks);
      setIsSharing(false);
      if ("error" in result) {
        showToast(result.error);
        return;
      }
      const url = `${window.location.origin}/t/${result.id}`;
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title: "My Slate taste teaser picks", url });
          return;
        } catch {
          // Backed out of the share sheet -- fall through to showing the
          // copy-link row below instead of treating this as an error.
        }
      }
      setShareLink(url);
    });
  }

  const current = deck[index];

  function finishSwiping(finalSwipes: AnonSwipe[]) {
    persistSwipes(finalSwipes);
    setPhase("loading");
    startTransition(async () => {
      try {
        const result = await getTasteTeaser(finalSwipes);
        setPicks(result);
      } catch {
        setPicks([]); // fall back to the generic "keep rating" copy below
      }
      setPhase("results");
    });
  }

  function handleRate(score: number | null) {
    const next = score !== null ? [...swipes, { titleId: current.id, score }] : swipes;
    setSwipes(next);
    persistSwipes(next);

    const ratedCount = next.length;
    const reachedDeckEnd = index + 1 >= deck.length;

    if (ratedCount >= MIN_SWIPES_FOR_TEASER || reachedDeckEnd) {
      finishSwiping(next);
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (phase === "loading") {
    return (
      <div className="mx-auto flex h-72 max-w-sm items-center justify-center text-sm text-foreground-muted">
        Finding your first picks…
      </div>
    );
  }

  if (phase === "results") {
    return (
      <div className="mx-auto w-full max-w-md text-center">
        <p className="font-display text-xs font-semibold uppercase tracking-wide text-accent">
          Based on what you just told us
        </p>
        {picks.length > 0 ? (
          <>
            <h2 className="font-display mt-2 text-2xl">Here&apos;s what Slate would show you</h2>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {picks.map((p) => (
                <div key={p.id}>
                  <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
                    {p.posterUrl && <Image src={p.posterUrl} alt={p.name} fill className="object-cover" />}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs font-medium">{p.name}</p>
                  <p className="line-clamp-2 text-[11px] text-foreground-muted">{p.why}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <h2 className="font-display mt-2 text-2xl">
            Rate a few more once you&apos;re in and this gets sharp fast
          </h2>
        )}

        <Link
          href="/signup"
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-gold-foil px-6 font-medium text-accent-foreground shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] hover:brightness-110"
        >
          Create an account to save this
        </Link>

        {picks.length > 0 && (
          <div className="mt-3">
            {shareLink ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={shareLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-10 min-w-0 flex-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-xs text-foreground-muted"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareLink);
                      showToast("Copied to clipboard");
                    } catch {
                      // Clipboard API blocked -- the link is still shown as
                      // selectable text above, so this is non-fatal.
                    }
                  }}
                  className="text-xs text-foreground-muted hover:text-accent"
                >
                  Copy
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isSharing}
                onClick={handleShareTeaser}
                className="inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-accent disabled:opacity-50"
              >
                <Share2 size={13} />
                {isSharing ? "Preparing..." : "Share your picks with a friend"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!current) return null;

  const progress = ((index + 1) / Math.min(deck.length, MIN_SWIPES_FOR_TEASER + deck.length)) * 100;

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-6 flex items-center justify-between">
        <span className="font-display text-xs font-semibold uppercase text-accent">Quick taste check</span>
        <Link href="/signup" className="text-xs text-foreground-muted hover:underline">
          Skip — just sign me up
        </Link>
      </div>

      <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
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
      <p className="mb-6 mt-1 text-xs uppercase tracking-wide text-foreground-muted">
        {[current.year, formatRuntime(current.runtimeMinutes), current.genres.join(", ")].filter(Boolean).join(" · ")}
      </p>

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
