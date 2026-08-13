"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, Minus, X } from "lucide-react";
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
type ExitDirection = "left" | "right" | "fade";

// Shared with the home page's own cinematic-intro overlay (see
// src/app/page.tsx) -- whichever surface plays the video+title first in
// a session sets this, so a just-signed-up user redirected from
// onboarding straight to Home doesn't see the same footage twice back
// to back.
const INTRO_SEEN_KEY = "backlot:cinematic-intro-shown";
const INTRO_VIDEO_MS = 3400;
const INTRO_TITLE_MS = 1400;
const SWIPE_THRESHOLD = 110;
const EXIT_DURATION_MS = 260;

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

  // Drag-to-swipe gesture state. dragOffset tracks the live pointer
  // delta while dragging; exitDirection takes over once the card is
  // released past SWIPE_THRESHOLD (or a rating button is tapped),
  // driving the fly-off transition before the next card mounts.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [exitDirection, setExitDirection] = useState<ExitDirection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const pointerRef = useRef<{ startX: number; startY: number; active: boolean }>({
    startX: 0,
    startY: 0,
    active: false,
  });

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

  // Belt-and-suspenders nav hiding: the intro overlay is already a fixed
  // z-50 layer that paints over the sticky z-40 nav header, but that only
  // holds once the overlay has actually mounted -- phase starts out
  // `null` for a tick (see the comment on that state) and the shared
  // NavBar lives in a completely different part of the tree (root
  // layout.tsx), so there's no prop path to it from here. Toggling a
  // class on <html> is the same zero-prop-drilling technique the home
  // page's own intro uses for hiding it (see globals.css) -- just driven
  // by real state here instead of a CSS-only :has() selector, since this
  // component already is a client component with the phase in hand.
  useEffect(() => {
    const introActive = phase === "intro-video" || phase === "intro-title";
    document.documentElement.classList.toggle("onboarding-intro-active", introActive);
    return () => document.documentElement.classList.remove("onboarding-intro-active");
  }, [phase]);

  // Neutralizes any leftover drag/exit transform the instant a new card
  // takes over -- see exitCard() below for why this can't just happen
  // inside the exit timeout (it would snap the still-visible outgoing
  // card back to center during the network round-trip). Same documented
  // exception as the phase-detection effect above: this is genuinely
  // synchronizing local gesture state to an external change (a new
  // card id), not something a lazy initializer could express.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDragOffset({ x: 0, y: 0 });
    setExitDirection(null);
  }, [current?.id]);

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

  // Plays the fly-off transition, then rates once it's fully off-screen.
  // handleRate's actual DB write can take a beat, but by then the card
  // is invisible (opacity 0, translated well past the viewport), so the
  // gap before the next card mounts is never visible to the user.
  function exitCard(direction: ExitDirection, score: number | null) {
    if (isPending || exitDirection) return;
    setExitDirection(direction);
    window.setTimeout(() => handleRate(score), EXIT_DURATION_MS);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (isPending || exitDirection) return;
    pointerRef.current = { startX: e.clientX, startY: e.clientY, active: true };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current.active) return;
    setDragOffset({
      x: e.clientX - pointerRef.current.startX,
      y: e.clientY - pointerRef.current.startY,
    });
  }

  function endDrag() {
    if (!pointerRef.current.active) return;
    pointerRef.current.active = false;
    setIsDragging(false);
    if (dragOffset.x > SWIPE_THRESHOLD) {
      exitCard("right", RATING_FOR.love_it);
    } else if (dragOffset.x < -SWIPE_THRESHOLD) {
      exitCard("left", RATING_FOR.not_for_me);
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  }

  if (phase === null) return null;

  if (phase === "intro-video") {
    return (
      <div
        onClick={skipIntro}
        className="flicker-slow fixed inset-0 z-50 cursor-pointer overflow-hidden bg-black"
      >
        {/* Public-domain 1920s Hollywoodland-sign footage, self-hosted
            -- see public/videos/onboarding-intro.mp4. Re-sourced from a
            higher-resolution archive.org derivative (1280x808, cropped
            to the real frame -- no pillarbox bars, no watermark strip)
            and re-encoded, specifically so object-cover's zoom-in on
            portrait screens draws from real detail instead of upscaling
            a 640x360 source -- that low-res crop was blurry enough that
            an earlier pass (see git history) fell back to object-contain
            just to avoid it. Muted autoplay + loop needs no user gesture
            in any browser, same pattern as the movie page's backdrop
            hero and the swipe deck's own trailer embeds. The whole
            overlay is clickable (not just the Skip label) so anyone who
            wants straight to the swipe deck can tap anywhere to get
            there. */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="onboarding-intro-zoom absolute inset-0 h-full w-full object-cover"
          /* objectPosition biases the crop toward the Hollywoodland sign
             (upper region of the source frame) instead of the geometric
             center -- the source video is cropped tight and tall around
             the sign so it reads clearly on portrait phones (which show
             the video edge-to-edge, no cropping needed there), but wider
             / landscape viewports crop the video's height to cover the
             container and would otherwise center on the hillside below
             the sign instead of the sign itself. */
          style={{ filter: "grayscale(1) contrast(1.15) brightness(0.85)", objectPosition: "center 25%" }}
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
          Tap to skip
        </button>
      </div>
    );
  }

  if (phase === "intro-title") {
    return (
      <div
        onClick={skipIntro}
        className="page-transition fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#0A0A09]"
      >
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at center, rgba(255,250,235,0.09) 0%, transparent 60%)" }}
        />
        <div className="onboarding-intro-grain absolute inset-0" />
        <p className="text-gold-foil font-hollywood relative text-5xl tracking-[0.3em]">Backlot</p>
        <div className="relative my-4 h-px w-16 bg-white/40" />
        <p className="font-display relative text-sm italic text-white/60">a picture house, for your taste</p>
        <button
          type="button"
          onClick={skipIntro}
          className="absolute bottom-6 right-6 font-sans text-xs tracking-wide text-white/40 transition-colors hover:text-white/70"
        >
          Tap to skip
        </button>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="mx-auto flex h-72 max-w-sm flex-col items-center justify-center gap-5 text-center">
        <svg width="48" height="48" viewBox="0 0 48 48" className="text-accent onboarding-ring-spin" aria-hidden="true">
          <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
          <circle
            cx="24"
            cy="24"
            r="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="32 87"
          />
        </svg>
        <div>
          <p className="font-display text-lg italic text-foreground">Developing your reel…</p>
          <p className="mt-1 font-sans text-[10px] uppercase tracking-[0.2em] text-foreground-muted">
            Backlot taste engine
          </p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mx-auto w-full max-w-md text-center">
        <p className="text-gold-foil font-sans text-xs font-medium uppercase tracking-[0.2em]">
          Your reel is ready
        </p>
        {picks.length > 0 ? (
          <>
            <h1 className="font-display mt-2 text-2xl italic">Now showing, for you</h1>
            <div className="mt-6 grid grid-cols-3 gap-4">
              {picks.map((p, i) => (
                <div
                  key={p.id}
                  className="stagger-card"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius-md)] bg-surface-raised shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)]">
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
          className="bg-gold-foil text-accent-foreground mt-8 inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-md)] px-6 font-sans text-sm font-semibold uppercase tracking-wide shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-[filter] hover:brightness-110"
        >
          Enter Backlot
        </button>
      </div>
    );
  }

  if (!current) return null;

  const rotation = exitDirection === "left" ? -16 : exitDirection === "right" ? 16 : dragOffset.x / 16;
  const translateX =
    exitDirection === "left" ? -560 : exitDirection === "right" ? 560 : exitDirection === "fade" ? 0 : dragOffset.x;
  const translateY = exitDirection === "fade" ? 16 : isDragging ? dragOffset.y * 0.35 : 0;
  const cardOpacity = exitDirection ? 0 : 1;
  const cardScale = exitDirection === "fade" ? 0.94 : 1;
  const loveOpacity = exitDirection === "right" ? 1 : exitDirection ? 0 : Math.min(Math.max(dragOffset.x / 90, 0), 1);
  const passOpacity =
    exitDirection === "left" ? 1 : exitDirection ? 0 : Math.min(Math.max(-dragOffset.x / 90, 0), 1);

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Full-bleed poster/trailer card -- eyebrow, progress hairline,
          title, meta and rating buttons all overlay the image itself
          (gradient scrims for legibility) instead of sitting in separate
          blocks above/below it, the modernized b&w editorial look that
          replaced the earlier gold "ticket card" treatment. Deliberately
          hardcoded neutral tones for the base card (not the sitewide
          gold --accent token) since it's meant to read as monochrome
          regardless of theme -- but the interactive chrome (stamps,
          Love it button) uses the real --accent/gold-foil treatment so
          it still feels like the rest of the app, not a bolted-on
          Tinder clone.
          Drag-to-swipe: pointer handlers live on this wrapper, and the
          trailer iframe below gets pointer-events-none so dragging works
          even when the pointer starts over the embedded video. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative mb-4 aspect-[3/4] w-full cursor-grab touch-none select-none overflow-hidden rounded-[var(--radius-lg)] bg-black active:cursor-grabbing"
        style={{
          transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg) scale(${cardScale})`,
          opacity: cardOpacity,
          transition: isDragging ? "none" : `transform ${EXIT_DURATION_MS}ms cubic-bezier(0.2,0.8,0.2,1), opacity ${EXIT_DURATION_MS}ms ease-out`,
        }}
      >
        {current.trailerKey ? (
          <iframe
            className="pointer-events-none absolute left-1/2 top-1/2 h-full w-auto min-w-full aspect-video -translate-x-1/2 -translate-y-1/2 border-0"
            src={`https://www.youtube.com/embed/${current.trailerKey}?autoplay=1&mute=1&loop=1&playlist=${current.trailerKey}&controls=0&rel=0&playsinline=1&modestbranding=1`}
            title={`${current.name} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
          />
        ) : current.posterUrl ? (
          <Image src={current.posterUrl} alt={current.name} fill className="pointer-events-none object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-[10px] font-semibold uppercase tracking-widest text-foreground-muted">
            {current.name}
          </div>
        )}

        <div className="onboarding-intro-grain pointer-events-none absolute inset-0 opacity-40" />

        <div
          className="font-hollywood pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 -rotate-12 rounded-[var(--radius-sm)] border-2 border-danger px-3 py-1 text-xl uppercase tracking-[0.12em] text-danger"
          style={{ opacity: passOpacity }}
        >
          Pass
        </div>
        <div
          className="text-gold-foil font-hollywood pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 rotate-12 rounded-[var(--radius-sm)] border-2 border-accent px-3 py-1 text-xl uppercase tracking-[0.12em]"
          style={{ opacity: loveOpacity }}
        >
          Love it
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-white/85">
              Taste training
            </span>
            <div className="pointer-events-auto flex items-center gap-3">
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
            <div className="bg-gold-foil h-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-4 pt-16">
          <h2 className="font-display text-xl italic text-white">{current.name}</h2>
          <p className="mb-4 mt-1 font-sans text-[11px] uppercase tracking-wide text-white/60">
            {[current.year, current.director, formatRuntime(current.runtimeMinutes), current.genres.join(", ")]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <div className="pointer-events-auto grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => exitCard("left", RATING_FOR.not_for_me)}
              className="flex items-center justify-center gap-1.5 rounded-full border border-white/35 py-2.5 font-sans text-[11px] font-medium uppercase tracking-wide text-white/85 transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Pass
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => exitCard("fade", RATING_FOR.its_fine)}
              className="flex items-center justify-center gap-1.5 rounded-full border border-white/35 py-2.5 font-sans text-[11px] font-medium uppercase tracking-wide text-white/85 transition-colors hover:border-white hover:text-white disabled:opacity-50"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              It&apos;s fine
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => exitCard("right", RATING_FOR.love_it)}
              className="bg-gold-foil text-accent-foreground flex items-center justify-center gap-1.5 rounded-full py-2.5 font-sans text-[11px] font-semibold uppercase tracking-wide shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-[filter] hover:brightness-110 disabled:opacity-50"
            >
              <Heart className="h-3.5 w-3.5" aria-hidden="true" />
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
