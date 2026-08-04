"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "@/components/ui/fade-image";
import { RatingStars } from "@/components/ui/rating-stars";
import { Button } from "@/components/ui/button";
import { ShareWrappedButton } from "@/components/wrapped/share-button";
import { buildWrappedSlides, formatHoursAsDaysAndHours, type WrappedSlide } from "@/lib/wrapped/build-slides";
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

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised ${shellHeight}`}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerLeave={() => setPaused(false)}
    >
      {/* Ambient background: dark base + a soft gold spotlight breathing
          behind everything, same "breathe-glow" loop used on the profile
          page -- ties the story shell back into the rest of the app's
          velvet-and-foil language instead of reading as a bolted-on
          widget. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(217,184,118,0.14),transparent_60%)]" />
      <div className="breathe-glow pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />

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

      <div key={`${index}-${playToken}`} className="wrapped-slide relative z-0 flex h-full w-full items-center justify-center px-6 pb-6 pt-12 sm:px-10">
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
  );
}

function GenresSlide({ genres }: { genres: { genre: string; count: number }[] }) {
  const [top, ...rest] = genres;
  return (
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
              className="stagger-card rounded-[var(--radius-full)] border border-border bg-surface px-3 py-1 text-xs"
              style={{ animationDelay: `${140 + i * 90}ms` }}
            >
              {g.genre} &middot; {g.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchetypeSlide({ name, percent }: { name: string; percent: number }) {
  return (
    <div className="wheel-in flex flex-col items-center gap-4 text-center">
      <div
        className="relative flex h-32 w-32 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(var(--accent) ${percent}%, rgba(217,184,118,0.15) ${percent}%)` }}
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-surface-raised">
          <span className="font-display text-2xl text-accent">{percent}%</span>
        </div>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-foreground-muted">You were, above all</p>
        <p className="font-section-heading mt-1 text-2xl sm:text-3xl">{name}</p>
      </div>
    </div>
  );
}

function TitleSlide({ label, title }: { label: string; title: WrappedTitleRef }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {title.posterUrl && (
        <div className="poster-fan-in relative h-56 w-36 overflow-hidden rounded-[var(--radius-lg)] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] sm:h-64 sm:w-40">
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
    <div className="stagger-card flex w-full max-w-sm flex-col items-center gap-5 text-center">
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
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface px-2 py-2">
      <p className="truncate text-sm font-medium text-accent">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-foreground-muted">{label}</p>
    </div>
  );
}
