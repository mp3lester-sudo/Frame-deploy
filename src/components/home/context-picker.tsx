import Link from "next/link";
import { CIRCUMSTANTIAL_CONTEXTS, CONTEXT_LABELS, type CircumstantialContext } from "@/lib/context/circumstantial";

/**
 * Plain server-rendered links (?context=...) rather than a client component
 * with its own fetch — consistent with the rest of the app (everything here
 * is RSC + server actions, no client-side data fetching pattern exists yet),
 * and it means picking a context is just a normal navigation, no extra JS.
 *
 * prefetch={false} is deliberate and load-bearing here, not the default:
 * next/image Link prefetches every visible Link's target the moment it
 * scrolls into view, which for these four pills meant every single home
 * page visit fired the FULL recommendation engine (two pgvector similarity
 * RPCs, a weather fetch, per-title reasoning — see getRecommendationsForUser
 * in engine.ts) up to four extra times in the background, on top of the
 * real render — a 5x server-load multiplier for a picker most visits never
 * touch. Confirmed via production network logs: those background prefetches
 * were measurably contending for resources and intermittently coming back
 * 503, which is what made picking a context feel like it was stalling —
 * the click's own request was competing with its own page's leftover
 * prefetch traffic. Turning off prefetch here means a click always starts
 * a clean, uncontended request instead.
 *
 * Single horizontally-scrolling row (flex-nowrap + overflow-x-auto), not
 * flex-wrap -- on a narrow phone screen five pills wrapped onto two rows,
 * which read as a second stacked line of clutter right under the
 * greeting instead of one clean row. Same no-scrollbar rail pattern
 * MoodRow already uses for the poster row below.
 */
export function ContextPicker({ active }: { active: CircumstantialContext }) {
  return (
    <div className="no-scrollbar -mx-4 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1">
      {CIRCUMSTANTIAL_CONTEXTS.map((context) => {
        const isActive = context === active;
        return (
          <Link
            key={context}
            href={context === "solo" ? "/" : `/?context=${context}`}
            prefetch={false}
            className={
              isActive
                ? "shrink-0 rounded-[var(--radius-full)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
                : "shrink-0 rounded-[var(--radius-full)] border border-border px-3 py-1.5 text-xs text-foreground-muted hover:border-border-strong hover:text-foreground"
            }
          >
            {CONTEXT_LABELS[context]}
          </Link>
        );
      })}
    </div>
  );
}
