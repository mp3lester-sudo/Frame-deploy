"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "@/components/ui/fade-image";
import { RatingStars } from "@/components/ui/rating-stars";
import { Button } from "@/components/ui/button";
import { ShareWrappedButton } from "@/components/wrapped/share-button";
import { buildWrappedSlides, formatHoursAsDaysAndHours, type WrappedSlide } from "@/lib/wrapped/build-slides";
import { getPosterGlow } from "@/lib/wrapped/poster-glow";
import type { WrappedResult, WrappedTitleRef } from "@/lib/taste-dna/wrapped";

/** How long each auto-advancing slide stays up before moving on -- title
 *  reveal slides (favorite/hidden gem) get a beat longer so there's time
 *  to actually look at the poster, not just register a flash of it. */
function durationForSlide(slide: WrappedSlide): number {
  return slide.type === "favoriteTitle" || slide.type === "hiddenGem" ? 5200 : 4000;
}

/**
 * A single film/short/whatever's "Wrapped" as a Spotify-Wrapped-style
 * story: full-bleed slides, segmented auto-advancing progress bar, tap
 * (or arrow-key) navigation, ending on a static, non-advancing recap
 * slide with the real Share action. Pure presentation -- all the "what
 * slides exist" logic lives in buildWrappedSlides (lib/wrapped/build-
 * slides.ts) so this component only has to walk an array and render.
 *
 * Every slide now sits on a poster-driven backdrop instead of a flat
 * surface color -- stat slides (which aren't tied to one specific title)
 * cycle through result.backdropPosterUrls (highest-rated titles from the
 * period, see computeWrapped) as a dimmed, blurred full-bleed image with
 * a frosted glass panel holding the actual stat; the two title-reveal
 * slides (favorite/hidden gem) instead get a "color-extracted" duotone
 * glow keyed off that title's id (see poster-glow.ts) with the poster
 * itself floating centered in front of it, rather than a small corner
 * thumbnail on a plain background.
 *
 * variant="compact" is used for the secondary weekly/monthly recap on
 * the same page (task #342) -- same mechanics, smaller shell, no
 * keyboard navigation (see the effect below) so two story instances on
 * one page don't both react to the same arrow-key press.
 */
export function WrappedStory({
  result,
  headline,
  shareYear,
  variant = "full",
}: {
  result: WrappedResult;
  headline: string;
  /** Only the annual recap has a real, ID-bearing share link (see
   *  createWrappedShare) -- omit this for the weekly/monthly recap and
   *  the finale slide skips the Share button entirely rather than
   *  offering a broken one. */
  shareYear?: number;
  variant?: "full" | "compact";
}) {
  const slides = useMemo(() => buildWrappedSlides(result, headline), [result, headline]);
  const lastIndex = slides.length - 1;
  const isFinale = (i: number) => slides[i]?.type === "finale";

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Bumped every time the story is replayed from the finale slide so the
  // slide-0 fade-in animation (keyed on this + index below) actually
  // replays instead of no-opping because index went 0 -> 0.
  const [playToken, setPlayToken] = useState(0);

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(lastIndex, next)));
  }
  function handleNext() {
    if (index < lastIndex) goTo(index + 1);
  }
  function handlePrev() {
    if (index > 0) goTo(index - 1);
  }
  function handleRestart() {
    setPlayToken((t) => t + 1);
    setIndex(0);
  }

  // Keyboard navigation only for the primary story on the page -- with
  // both a compact (recent) and full (yearly) WrappedStory mounted at
  // once, both listening for arrow keys would double-advance whichever
  // one the user meant to control.
  useEffect(() => {
    if (variant !== "full") return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, index, lastIndex]);

  const current = slides[index];
  const shellHeight = variant === "full" ? "h-[560px] sm:h-[640px]" : "h-[360px] sm:h-[420px]";
  const backdropPoster =
    result.backdropPosterUrls.length > 0 ? result.backdropPosterUrls[index % result.backdropPosterUrls.length] : null;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised ${shellHeight}`}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerLeave={() => setPaused(false)}
    >
      <SlideBackdrop slide={current} backdropPoster={backdropPoster} />

      {/* Segmented progress bar -- one segment per auto-advancing slide,
          intentionally excluding the finale (it's static, see the class
          doc comment). The active segment's fill animation IS the
          auto-advance timer: onAnimationEnd fires handleNext, so the
          visual bar and the actual timing can never drift apart the way
          a bar driven by a separate setTimeout could. */}
      <div className="absolute inset-x-3 top-3 z-20 flex gap-1">
        {slides.slice(0, lastIndex).map((slide, i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/20">
            {i < index ? (
              <div className="h-full w-full bg-accent" />
            ) : i === index ? (
              <div
                key={`${i}-${playToken}`}
                data-paused={paused}
                className="wrapped-progress-fill h-full bg-accent"
                style={{ animationDuration: `${durationForSlide(slide)}ms` }}
                onAnimationEnd={handleNext}
              />
            ) : null}
          </div>
        ))}
      </div>

      {/* Tap zones -- left third rewinds, right two-thirds advances,
          matching the Instagram/Spotify-Wrapped convention of "back is a
          smaller target than forward" since forward is the far more
          common tap. Not rendered on the finale slide, which has its own
          real buttons instead (see FinaleSlide) -- an invisible
          full-bleed tap layer over Share/Replay buttons would swallow
          those clicks. */}
      {!isFinale(index) && (
        <div className="absolute inset-0 z-10 flex">
          <button
            type="button"
            aria-label="Previous"
            className="h-full w-1/3 cursor-default"
            onClick={handlePrev}
          />
          <button
            type="button"
            aria-label="Next"
            className="h-full w-2/3 cursor-default"
            onClick={handleNext}
          />
        </div>
      )}

      <div key={`${index}-${playToken}`} className="wrapped-slide relative z-[5] flex h-full w-full items-center justify-center px-6 pb-6 pt-12 sm:px-10">
        <SlideContent
          slide={current}
          variant={variant}
          shareYear={shareYear}
          onRestart={handleRestart}
        />
      </div>
    </div>
  );
}

/**
 * The full-bleed imagery behind every slide. Two modes:
 *  - "glow": favoriteTitle/hiddenGem slides get a radial duotone pulled
 *    from getPosterGlow(title.id) -- same title always gets the same
 *    glow, so replaying the story or the recap on the profile page never
 *    flickers to a different color for the same film.
 *  - "frosted": everything else gets a dimmed, blurred backdrop poster
 *    (cycled from result.backdropPosterUrls) with a bottom-heavy scrim so
 *    the stat text sitting in front always stays legible regardless of
 *    how bright the underlying poster is.
 * Renders nothing (falls back to the shell's own bg-surface-raised) when
 * there's no poster to show at all -- a brand-new account with exactly
 * MIN_RATINGS_FOR_WRAPPED titles and no posters on file shouldn't get a
 * broken-looking blank glow.
 */
function SlideBackdrop({ slide, backdropPoster }: { slide: WrappedSlide; backdropPoster: string | null }) {
  if (slide.type === "favoriteTitle" || slide.type === "hiddenGem") {
    const glow = getPosterGlow(slide.title.id);
    return (
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: `radial-gradient(ellipse at 50% 38%, ${glow.from} 0%, ${glow.to} 70%)` }}
      />
    );
  }

  if (!backdropPoster) {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,rgba(217,184,118,0.14),transparent_60%)]" />
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <Image src={backdropPoster} alt="" fill className="scale-110 object-cover opacity-40 blur-sm" />
      <div className="absolute inset-0 bg-gradient-to-b from-[rgba(18,7,8,0.55)] via-[rgba(18,7,8,0.55)] to-[rgba(18,7,8,0.96)]" />
    </div>
  );
}

function SlideContent({
  slide,
  variant,
  shareYear,
  onRestart,
}: {
  slide: WrappedSlide;
  variant: "full" | "compact";
  shareYear?: number;
  onRestart: () => void;
}) {
  switch (slide.type) {
    case "intro":
      return <IntroSlide headline={slide.headline} />;
    case "totalFilms":
      return <StatSlide value={String(slide.count)} label={slide.count === 1 ? "film watched" : "films watched"} />;
    case "totalHours": {
      const { days, hours } = formatHoursAsDaysAndHours(slide.hours);
      const value = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
      return <StatSlide value={value} label="spent watching" sublabel={`${slide.hours} total hours`} />;
    }
    case "topGenres":
      return <GenresSlide genres={slide.genres} />;
    case "topDirector":
      return <StatSlide value={slide.name} label={`your most-watched director (${slide.count} films)`} isText />;
    case "archetype":
      return <ArchetypeSlide name={slide.name} percent={slide.percent} />;
    case "favoriteTitle":
      return <TitleSlide label="Your favorite" title={slide.title} />;
    case "hiddenGem":
      return <TitleSlide label="Your hidden gem" title={slide.title} />;
    case "finale":
      return (
        <FinaleSlide
          headline={slide.headline}
          summary={slide.summary}
          result={slide.result}
          shareYear={variant === "full" ? shareYear : undefined}
          onRestart={onRestart}
        />
      );
  }
}

function IntroSlide({ headline }: { headline: string }) {
  return (
    <div className="stagger-card flex flex-col items-center gap-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Backlot Wrapped</p>
      <h2 className="font-section-heading text-3xl sm:text-4xl">{headline}</h2>
      <p className="mt-1 text-sm text-foreground-muted">Tap to begin</p>
    </div>
  );
}

/** Frosted glass panel wrapping stat text over the full-bleed backdrop
 *  poster -- the blur + translucent fill is what keeps a stat legible
 *  regardless of how bright or busy the poster behind it is, instead of
 *  the old plain-background centered text. */
function FrostedPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-xs rounded-[var(--radius-lg)] border border-white/10 bg-[rgba(20,10,12,0.55)] px-6 py-6 backdrop-blur-md">
      {children}
    </div>
  );
}

function StatSlide({
  value,
  label,
  sublabel,
  isText,
}: {
  value: string;
  label: string;
  sublabel?: string;
  isText?: boolean;
}) {
  return (
    <FrostedPanel>
      <div className="badge-pop flex flex-col items-center gap-2 text-center">
        <p
          className={
            isText
              ? "font-section-heading max-w-xs text-3xl sm:text-4xl"
              : "font-display text-6xl text-accent sm:text-7xl"
          }
        >
          {value}
        </p>
        <p className="font-section-body text-sm uppercase tracking-wider text-foreground-muted">{label}</p>
        {sublabel && <p className="text-xs text-foreground-muted/70">{sublabel}</p>}
      </div>
    </FrostedPanel>
  );
}

function GenresSlide({ genres }: { genres: { genre: string; count: number }[] }) {
  const [top, ...rest] = genres;
  return (
    <FrostedPanel>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="badge-pop">
          <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Your most-watched genre</p>
          <p className="font-display mt-1 text-4xl text-accent sm:text-5xl">{top.genre}</p>
          <p className="mt-1 text-xs text-foreground-muted">{top.count} titles</p>
        </div>
        {rest.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {rest.slice(0, 5).map((g, i) => (
              <span
                key={g.genre}
                className="stagger-card rounded-[var(--radius-full)] border border-white/15 bg-white/5 px-3 py-1 text-xs"
                style={{ animationDelay: `${140 + i * 90}ms` }}
              >
                {g.genre} &middot; {g.count}
              </span>
            ))}
          </div>
        )}
      </div>
    </FrostedPanel>
  );
}

function ArchetypeSlide({ name, percent }: { name: string; percent: number }) {
  return (
    <FrostedPanel>
      <div className="wheel-in flex flex-col items-center gap-4 text-center">
        <div
          className="relative flex h-32 w-32 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(var(--accent) ${percent}%, rgba(217,184,118,0.15) ${percent}%)` }}
        >
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#1f0f13]">
            <span className="font-display text-2xl text-accent">{percent}%</span>
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-foreground-muted">You were, above all</p>
          <p className="font-section-heading mt-1 text-2xl sm:text-3xl">{name}</p>
        </div>
      </div>
    </FrostedPanel>
  );
}

function TitleSlide({ label, title }: { label: string; title: WrappedTitleRef }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {title.posterUrl && (
        <div className="poster-fan-in relative h-64 w-44 overflow-hidden rounded-[var(--radius-lg)] shadow-[0_28px_60px_-14px_rgba(0,0,0,0.85)] sm:h-72 sm:w-48">
          <Image src={title.posterUrl} alt={title.name} fill className="object-cover" />
        </div>
      )}
      <div className="stagger-card" style={{ animationDelay: "160ms" }}>
        <p className="text-[11px] uppercase tracking-wider text-accent">{label}</p>
        <p className="font-section-heading mt-1 text-2xl">{title.name}</p>
        <div className="mt-2 flex justify-center">
          <RatingStars value={title.score} size={16} />
        </div>
      </div>
    </div>
  );
}

function FinaleSlide({
  headline,
  summary,
  result,
  shareYear,
  onRestart,
}: {
  headline: string;
  summary: string;
  result: WrappedResult;
  shareYear?: number;
  onRestart: () => void;
}) {
  return (
    <FrostedPanel>
      <div className="stagger-card flex w-full flex-col items-center gap-5 text-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">Backlot Wrapped</p>
          <h2 className="font-section-heading mt-1 text-2xl sm:text-3xl">{headline}</h2>
          <p className="font-section-body mt-2 text-sm text-foreground-muted">{summary}</p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2">
          <MiniStat label="Films" value={String(result.totalRated)} />
          <MiniStat label="Hours" value={String(result.totalHours)} />
          {result.topGenres[0] && <MiniStat label="Top genre" value={result.topGenres[0].genre} />}
          {result.topArchetype && <MiniStat label="Archetype" value={result.topArchetype.name} />}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {shareYear != null && <ShareWrappedButton year={shareYear} />}
          <Button type="button" variant="secondary" size="sm" onClick={onRestart}>
            Watch again
          </Button>
        </div>
      </div>
    </FrostedPanel>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-white/10 bg-white/5 px-2 py-2">
      <p className="truncate text-sm font-medium text-accent">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-foreground-muted">{label}</p>
    </div>
  );
}
