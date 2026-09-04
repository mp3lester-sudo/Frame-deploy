"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Moon, Heart, Users, Volume2, Clock, ChevronDown, Check } from "lucide-react";
import { CIRCUMSTANTIAL_CONTEXTS, CONTEXT_LABELS, type CircumstantialContext } from "@/lib/context/circumstantial";

const CONTEXT_ICONS: Record<CircumstantialContext, typeof Moon> = {
  solo: Moon,
  date_night: Heart,
  with_friends: Users,
  background: Volume2,
  something_short: Clock,
};

// One line under each option's label in the expanded panel -- the label
// alone ("Background watch") doesn't always make the *effect* obvious;
// this says what picking it actually does to tonight's pick, in plain
// words, the way a concierge would rather than a dry restatement of the
// label.
const CONTEXT_DESCRIPTIONS: Record<CircumstantialContext, string> = {
  solo: "Just you tonight",
  date_night: "Something to share",
  with_friends: "A crowd-pleaser",
  background: "On in the background",
  something_short: "Under 100 minutes",
};

/**
 * Concept C ("concierge button") -- replaces the five-across glass segmented
 * rail (Concept B, previously shipped here) with a single collapsed pill
 * showing only the active context, that expands into a panel of five full
 * rows (icon + label + one-line description + checkmark on the active row).
 * Rationale from the rendition round: the segmented rail has to always
 * show all five options at once, which on a phone competes for width
 * against the weather line, the greeting, and the hero right below it --
 * every visit pays that header-space cost even though most visits never
 * touch the picker. Collapsing to one line most of the time and trading a
 * single extra tap for the rare context-switch reclaims that space, and
 * the expanded panel has enough room to actually explain each option
 * instead of a five-way-squeezed short label.
 *
 * Trigger restyle, "reel-tab strip" (design rendition round 2, option E):
 * the collapsed trigger no longer looks like a plain rounded-full glass
 * pill -- it's a rounded-md card with a five-segment tick row above the
 * label, one per circumstantial context, the active one lit gold. It's a
 * quiet nod to "there are five of these" (a filmstrip frame-counter
 * motif, fitting the app's cinema identity) without spelling all five out
 * while collapsed, and it still collapses/expands exactly the same way --
 * only the trigger's own visual treatment changed, not its behavior or
 * the expanded panel below it.
 *
 * Now a client component (the segmented-rail version deliberately wasn't
 * one -- see its retired comments) because the open/closed panel state is
 * inherently client-side; there's no way to server-render "is this
 * currently expanded" since it isn't part of the URL or any persisted
 * state, just transient UI. Picking a context itself is still a plain
 * Link navigation (?context=...), not client-side state -- only the
 * panel's open/closed affordance is client state, matching how
 * AddToListMenu split the same concern (client-side menu affordance,
 * server actions for the actual mutation).
 *
 * prefetch={false} on every option Link, carried over unchanged from the
 * segmented-rail version: next/link prefetches every visible Link's
 * target the moment it scrolls into view, which for five context options
 * meant every home page visit fired the full recommendation engine (two
 * pgvector similarity RPCs, a weather fetch, per-title reasoning) up to
 * five extra times in the background. Still true here even though only
 * one option's Link is visible at a time when collapsed -- the panel's
 * rows are all mounted (just visually hidden) so their Links would still
 * prefetch on scroll-into-view without this.
 */
export function ContextPicker({ active }: { active: CircumstantialContext }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const ActiveIcon = CONTEXT_ICONS[active];
  // Reel-tab strip (design rendition "E"): a five-segment tick row above the
  // label, styled after a filmstrip's frame counter, with the active
  // context's segment lit gold -- a quiet "there are 5 of these" signal
  // that doesn't require spelling all five out while collapsed.
  const activeIndex = CIRCUMSTANTIAL_CONTEXTS.indexOf(active);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex w-full flex-col gap-2.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-sm text-foreground"
      >
        <span className="flex gap-1.5" aria-hidden="true">
          {CIRCUMSTANTIAL_CONTEXTS.map((context, i) => (
            <span
              key={context}
              className={
                i === activeIndex
                  ? "h-[3px] flex-1 rounded-full bg-accent shadow-[0_0_6px_rgba(217,184,118,0.6)]"
                  : "h-[3px] flex-1 rounded-full bg-accent/15"
              }
            />
          ))}
        </span>
        <span className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <ActiveIcon size={15} className="text-accent" aria-hidden="true" />
            {CONTEXT_LABELS[active]} tonight
          </span>
          <ChevronDown
            size={15}
            className={open ? "rotate-180 text-foreground-muted transition-transform" : "text-foreground-muted transition-transform"}
            aria-hidden="true"
          />
        </span>
      </button>
      {open && (
        <div
          role="radiogroup"
          aria-label="What's tonight"
          className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--surface-raised)]"
        >
          {CIRCUMSTANTIAL_CONTEXTS.map((context, i) => {
            const isActive = context === active;
            const Icon = CONTEXT_ICONS[context];
            return (
              <Link
                key={context}
                href={context === "solo" ? "/" : `/?context=${context}`}
                prefetch={false}
                role="radio"
                aria-checked={isActive}
                onClick={() => setOpen(false)}
                className={
                  isActive
                    ? `flex items-center gap-2.5 px-3.5 py-2.5 bg-accent/10 ${i > 0 ? "border-t border-[var(--glass-border)]" : ""}`
                    : `flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-[var(--glass-bg)] ${i > 0 ? "border-t border-[var(--glass-border)]" : ""}`
                }
              >
                <Icon size={15} className={isActive ? "text-accent" : "text-foreground-muted"} aria-hidden="true" />
                <span className="flex-1">
                  <span className={isActive ? "block text-[13px] font-medium text-foreground" : "block text-[13px] text-foreground"}>
                    {CONTEXT_LABELS[context]}
                  </span>
                  <span className="block text-[11px] text-foreground-muted">{CONTEXT_DESCRIPTIONS[context]}</span>
                </span>
                {isActive && <Check size={14} className="text-accent" aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
