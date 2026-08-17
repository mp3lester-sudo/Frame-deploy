import Link from "next/link";
import { CIRCUMSTANTIAL_CONTEXTS, CONTEXT_LABELS, type CircumstantialContext } from "@/lib/context/circumstantial";

// Short, always-visible label per segment -- distinct from CONTEXT_LABELS
// (still used in full below, for aria-label) because this control shows
// its label at every screen size now, not just sm and up, so it has to
// fit five-across in one row on a narrow phone without wrapping or
// truncating. "Friends" reads unambiguously as "with friends" once it's
// sitting next to Solo/Date night/Ambient/Short; the full phrasing is
// still what a screen reader announces via aria-label below.
const CONTEXT_SHORT_LABELS: Record<CircumstantialContext, string> = {
  solo: "Solo",
  date_night: "Date night",
  with_friends: "Friends",
  background: "Ambient",
  something_short: "Short",
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
 * Text labels only, no icons -- an earlier pass here paired each segment
 * with a small icon (Moon/Heart/Users/Waves/Timer) and hid the text
 * label below the sm breakpoint to save room, which read as five vague
 * glyphs on a phone instead of five clearly-named options. Every segment
 * now always shows its own short label (see CONTEXT_SHORT_LABELS above)
 * at every screen width -- a control whose whole job is "tell someone
 * what each option is" has to actually say so, not lean on an icon
 * standing in for a word.
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
 * a narrow phone. A single track with equal 1/5-width segments does,
 * as long as each label stays short (see CONTEXT_SHORT_LABELS) --
 * nothing to scroll past or miss off the edge.
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
                ? "relative z-10 flex flex-1 basis-0 items-center justify-center rounded-[var(--radius-full)] px-1 py-2 text-center text-[9.5px] font-semibold leading-tight text-[var(--accent-foreground)]"
                : "relative z-10 flex flex-1 basis-0 items-center justify-center rounded-[var(--radius-full)] px-1 py-2 text-center text-[9.5px] leading-tight text-foreground-muted hover:text-foreground"
            }
          >
            {CONTEXT_SHORT_LABELS[context]}
          </Link>
        );
      })}
    </div>
  );
}
