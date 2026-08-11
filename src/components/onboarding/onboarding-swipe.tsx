"use client";

import { useEffect, useState, useTransition } from "react";
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
  trailerKey: string | null;
}

const RATING_FOR = { not_for_me: 1, its_fine: 3, love_it: 5 } as const;

// "tier" self-report phase removed -- what used to be a one-time "what
// kind of moviegoer are you" pick at the start of onboarding is now
// computed later from actual watching/reviewing activity (Cinema Score,
// src/lib/profile/cinema-score.ts) instead of asked upfront before
// there's any activity to base it on. Onboarding now goes straight to
// swiping (after the cinematic intro, first time only).
type Phase = "intro-video" | "intro-title" | "swiping" | "loading" | "done";

const INTRO_SEEN_KEY = "backlot-onboarding-intro-seen";
const INTRO_VIDEO_MS = 4500;
const INTRO_TITLE_MS = 2200;

export function OnboardingSwipe({ titles }: { titles: SwipeTitle[] }) {
  const [index, setIndex] = useState(0);
  // Starts `null` rather than guessing a phase, because whether to show
  // the intro depends on sessionStorage + prefers-reduced-motion, both
  // only knowable client-side -- guessing here would either flash the
  // intro before swapping it out, or mismatch what the server rendered.
  const [phase, setPhase] = useState<Phase | null>(null);
  const [picks, setPicks] = useState<OnboardingCompletionPick[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const current = titles[index];
  const progress = ((index + 1) / titles.length) * 100;

  useEffect(() => {
    if (phase !== null) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alreadySeen = sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
    // Deliberately in an effect, not a lazy useState initializer -- the
    // latter would run during SSR too (no sessionStorage/matchMedia
    // there) and disagree with the client's first hydration render, the
    // same class of bug this pattern avoids elsewhere (see
    // promo-banner.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(reducedMotion || alreadySeen ? "swiping" : "intro-video");
  }, [phase]);

  useEffect(() => {
    if (phase !== "intro-video") return;
    const timer = setTimeout(() => setPhase("intro-title"), INTRO_VIDEO_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "intro-title") return;
    const timer = setTimeout(() => {
      sessionStorage.setItem(INTRO_SEEN_KEY, "1");
      setPhase("swiping");
    }, INTRO_TITLE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  function skipIntro() {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
    setPhase("swiping");
  }

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

  if (phase === null) return null;

  if (phase === "intro-video") {
    return (
      <div className="flicker-slow fixed inset-0 z-50 overflow-hidden bg-black">
        {/* Public-domain 1945 footage (Hollywood and Vine), self-hosted --
            see public/videos/onboarding-intro.mp4. Muted autoplay + loop
            needs no user gesture in any browser, same pattern as the
            movie page's backdrop hero and the swipe deck's own trailer
            embeds. */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="onboarding-intro-zoom absolute inset-0 h-full w-full object-cover"
          style={{ filter: "grayscale(1) contrast(1.15) brightness(0.85)" }}
        >
          <source src="/videos/onboarding-intro.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.85) 100%)" }}
        />
        <div className="onboarding-intro-grain absolute inset-0" />
        <button
          type="button"
          onClick={skipIntro}
          className="absolute bottom-6 right-6 font-sans text-xs tracking-wide text-white/50 transition-colors hover:text-white/85"
        >
          Skip
        </button>
      </div>
    );
  }

  if (phase === "intro-title") {
    return (
      <div className="page-transition fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0A0A09]">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at center, rgba(255,250,235,0.09) 0%, transparent 60%)" }}
        />
        <div className="onboarding-intro-grain absolute inset-0" />
        <p className="font-hollywood relative text-5xl tracking-[0.3em] text-[#EDE6D6]">Backlot</p>
        <div className="relative my-4 h-px w-16 bg-white/40" />
        <p className="font-display relative text-sm italic text-white/60">a picture house, for your taste</p>
        <button
          type="button"
          onClick={skipIntro}
          className="absolute bottom-6 right-6 font-sans text-xs tracking-wide text-white/40 transition-colors hover:text-white/70"
        >
          Skip
        </button>
      </div>
    );
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
        <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-foreground-muted">
          Your taste profile is ready
        </p>
        {picks.length > 0 ? (
          <>
            <h1 className="font-display mt-2 text-2xl italic">Here&apos;s what we&apos;ve got so far</h1>
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
          <h1 className="font-display mt-2 text-2xl italic">You&apos;re all set</h1>
        )}

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-[#EDE6D6] px-6 font-sans text-sm font-semibold uppercase tracking-wide text-black transition-opacity hover:opacity-90"
        >
          Let&apos;s go
        </button>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Full-bleed poster/trailer card -- eyebrow, progress hairline,
          title, meta and rating buttons all overlay the image itself
          (gradient scrims for legibility) instead of sitting in separate
          blocks above/below it, the modernized b&w editorial look that
          replaced the earlier gold "ticket card" treatment. Deliberately
          hardcoded neutral tones here (not the sitewide gold --accent
          token) since this card is meant to read as monochrome regardless
          of theme. */}
      <div
        key={current.id}
        className="relative mb-4 aspect-[3/4] w-full overflow-hidden rounded-[var(--radius-lg)] bg-black"
      >
        {current.trailerKey ? (
          <iframe
            className="absolute left-1/2 top-1/2 h-full w-auto min-w-full aspect-video -translate-x-1/2 -translate-y-1/2 border-0"
            src={`https://www.youtube.com/embed/${current.trailerKey}?autoplay=1&mute=1&loop=1&playlist=${current.trailerKey}&controls=0&rel=0&playsinline=1&modestbranding=1`}
            title={`${current.name} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
          />
        ) : current.posterUrl ? (
          <Image src={current.posterUrl} alt={current.name} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-[10px] font-semibold uppercase tracking-widest text-foreground-muted">
            {current.name}
          </div>
        )}

        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-white/85">
              Taste training
            </span>
            <div className="flex items-center gap-3">
              <span className="font-sans text-[10px] text-white/60">
                {index + 1} / {titles.length}
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={finish}
                className="font-sans text-[10px] text-white/60 hover:text-white/90 hover:underline disabled:opacity-50"
              >
                Skip for now
              </button>
            </div>
          </div>
          <div className="h-px w-full overflow-hidden bg-white/20">
            <div className="h-full bg-[#EDE6D6] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-4 pt-16">
          <h2 className="font-display text-xl italic text-white">{current.name}</h2>
          <p className="mb-4 mt-1 font-sans text-[11px] uppercase tracking-wide text-white/60">
            {[current.year, current.director, formatRuntime(current.runtimeMinutes), current.genres.join(", ")]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRate(RATING_FOR.not_for_me)}
              className="rounded-full border border-white/35 py-2.5 font-sans text-[11px] font-medium uppercase tracking-wide text-white/85 transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
            >
              Pass
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRate(RATING_FOR.its_fine)}
              className="rounded-full border border-white/35 py-2.5 font-sans text-[11px] font-medium uppercase tracking-wide text-white/85 transition-colors hover:border-white hover:text-white disabled:opacity-50"
            >
              It&apos;s fine
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRate(RATING_FOR.love_it)}
              className="rounded-full bg-[#EDE6D6] py-2.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Love it
            </button>
          </div>
        </div>
      </div>

      {current.overview && (
        <p className="font-display mb-4 text-sm italic leading-relaxed text-foreground-muted">{current.overview}</p>
      )}

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
