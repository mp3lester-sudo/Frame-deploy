import Link from "next/link";
import { Moon, Heart, Users, Waves, Timer } from "lucide-react";
import { CIRCUMSTANTIAL_CONTEXTS, CONTEXT_LABELS, type CircumstantialContext } from "@/lib/context/circumstantial";

// One icon per context, same size/weight language as the nav's own
// Movies/Shows segmented toggle (media-type-toggle.tsx) -- Moon for
// solo/quiet, Heart for date night, Users for a group, Waves for
// background/ambient (half-attention, nothing urgent), Timer for
// something short (the one context that's about time, not company).
const CONTEXT_ICONS: Record<CircumstantialContext, typeof Moon> = {
  solo: Moon,
  date_night: Heart,
  with_friends: Users,
  background: Waves,
  something_short: Timer,
};

/**
 * Home page design pass (Concept B) -- was five separate pill buttons
 * (solid gold for active, plain outline otherwise), each competing for
 * attention as its own little button. Now one continuous glass track
 * (same --glass-bg/--glass-border tokens as the nav bar and every other
 * "modernization pass" surface) with a single sliding gold thumb behind
 * whichever segment is active, so the five options read as one control
 * with a state instead of five unrelated buttons -- the same idea
 * already shipped on the Movies/Shows toggle, just generalized from 2
 * segments to 5 and built as a server component instead of a client
 * one (see below for why that split still matters here).
 *
 * Still plain server-rendered links (?context=...), not a client
 * component with its own state -- consistent with the rest of the app
 * (everything here is RSC + server actions, no client-side data
 * fetching pattern exists yet), and it means picking a context is just
 * a normal navigation, no extra JS. The thumb's position is just as
 * server-renderable as the old active/inactive pill class was: it's a
 * pure function of the `active` prop, computed once at render time via
 * activeIndex below, no client state needed to know where it goes.
 *
 * prefetch={false} is deliberate and load-bearing here, not the
 * default: next/image Link prefetches every visible Link's target the
 * moment it scrolls into view, which for these five segments meant
 * every single home page visit fired the FULL recommendation engine
 * (two pgvector similarity RPCs, a weather fetch, per-title reasoning
 * -- see getRecommendationsForUser in engine.ts) up to five extra times
 * in the background, on top of the real render -- a 6x server-load
 * multiplier for a picker most visits never touch. Confirmed via
 * production network logs: those background prefetches were measurably
 * contending for resources and intermittently coming back 503, which is
 * what made picking a context feel like it was stalling -- the click's
 * own request was competing with its own page's leftover prefetch
 * traffic. Turning off prefetch here means a click always starts a
 * clean, uncontended request instead.
 *
 * Fixed 5-up row now, not a horizontally-scrolling rail -- the old
 * version used flex-nowrap + overflow-x-auto because five separate
 * pills at comfortable tap-target width didn't reliably fit one line on
 * a narrow phone. A single track with equal 1/5-width segments does:
 * labels hide below the sm breakpoint (icon + aria-label only, same
 * pattern the Movies/Shows toggle already uses for its own labels), so
 * every screen size shows all five options as one control, nothing to
 * scroll past or miss off the edge.
 */
export function ContextPicker({ active }: { active: CircumstantialContext }) {
  const activeIndex = CIRCUMSTANTIAL_CONTEXTS.indexOf(active);
  const segmentCount = CIRCUMSTANTIAL_CONTEXTS.length;

  return (
    <div
      role="radiogroup"
      aria-label="What's tonight"
      className="relative flex items-center gap-0.5 rounded-[var(--radius-full)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1"
    >
      {/* The sliding thumb -- one element, repositioned per render via
          activeIndex rather than a whole extra DOM node per segment.
          Inset by the track's own p-1 (4px) on every side so it sits
          fully inside the glass track instead of touching its border,
          same visual relationship the Movies/Shows toggle's active
          state has to its own container. */}
      <div
        aria-hidden="true"
        className="absolute rounded-[var(--radius-full)]"
        style={{
          top: 4,
          bottom: 4,
          left: `calc(4px + (100% - 8px) * ${activeIndex} / ${segmentCount})`,
          width: `calc((100% - 8px) / ${segmentCount})`,
          backgroundImage: "var(--accent-gradient)",
        }}
      />
      {CIRCUMSTANTIAL_CONTEXTS.map((context) => {
        const isActive = context === active;
        const Icon = CONTEXT_ICONS[context];
        return (
          <Link
            key={context}
            href={context === "solo" ? "/" : `/?context=${context}`}
            prefetch={false}
            role="radio"
            aria-checked={isActive}
            aria-label={CONTEXT_LABELS[context]}
            className={
              isActive
                ? "relative z-10 flex flex-1 basis-0 items-center justify-center gap-1.5 rounded-[var(--radius-full)] px-1.5 py-2 text-[11px] font-semibold text-[var(--accent-foreground)]"
                : "relative z-10 flex flex-1 basis-0 items-center justify-center gap-1.5 rounded-[var(--radius-full)] px-1.5 py-2 text-[11px] text-foreground-muted hover:text-foreground"
            }
          >
            <Icon size={13} />
            <span className="hidden sm:inline">{CONTEXT_LABELS[context]}</span>
          </Link>
        );
      })}
    </div>
  );
}
