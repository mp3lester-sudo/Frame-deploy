"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { PersonPortrait } from "@/components/person-portrait";

/**
 * Portrait + name/meta/bio header for a person profile page, as one client
 * component. Unlike a fixed line-clamp, the bio is only truncated (and the
 * "Show more" toggle only shown) once the bio's own natural height would run
 * past the bottom of the portrait photo — a short bio that already fits
 * alongside the photo renders in full with no toggle at all. The toggle
 * lives directly under the portrait rather than under the bio text, so its
 * expanded/collapsed state has to be owned by this shared parent rather
 * than by the bio text itself.
 */
export function PersonHero({
  photoSrc,
  name,
  birthdayLabel,
  placeOfBirth,
  bio,
  bioLoading = false,
}: {
  photoSrc?: string | null;
  name: string;
  birthdayLabel: string | null;
  placeOfBirth: string | null;
  bio: string | null;
  // True while the TMDB bio lookup is still in flight (streamed in via its
  // own Suspense boundary -- see person/[id]/page.tsx) so the hero can show
  // a neutral loading skeleton instead of the misleading "No biography
  // available yet" empty state.
  bioLoading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clampHeight, setClampHeight] = useState<number | null>(null);
  const [overflows, setOverflows] = useState(false);
  const portraitRef = useRef<HTMLDivElement>(null);
  const bioRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (!bio) return;

    function measure() {
      const portraitEl = portraitRef.current;
      const bioEl = bioRef.current;
      if (!portraitEl || !bioEl) return;
      const portraitHeight = portraitEl.getBoundingClientRect().height;
      // scrollHeight reflects the paragraph's natural, unclamped height
      // regardless of the wrapper's overflow-hidden clamp below.
      const bioHeight = bioEl.scrollHeight;
      setClampHeight(portraitHeight);
      // Small tolerance so a bio that lands within a few px of the photo's
      // bottom edge doesn't trigger a toggle for effectively no gain.
      setOverflows(bioHeight > portraitHeight + 4);
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (portraitRef.current) observer.observe(portraitRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [bio]);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <div className="w-40 shrink-0 sm:w-56">
        <div ref={portraitRef}>
          <PersonPortrait src={photoSrc} name={name} />
        </div>
        {overflows && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 w-full text-center text-xs font-medium text-accent hover:brightness-110"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      <div className="flex-1">
        <h1 className="font-display text-2xl sm:text-3xl">{name}</h1>
        {(birthdayLabel || placeOfBirth) && (
          <p className="mt-1 text-sm text-foreground-muted">
            {birthdayLabel}
            {birthdayLabel && placeOfBirth && " · "}
            {placeOfBirth}
          </p>
        )}
        {bio ? (
          <div
            className="mt-4"
            style={!expanded && clampHeight ? { maxHeight: clampHeight, overflow: "hidden" } : undefined}
          >
            <p ref={bioRef} className="whitespace-pre-line text-sm leading-relaxed text-foreground-muted">
              {bio}
            </p>
          </div>
        ) : bioLoading ? (
          <div className="mt-4 animate-pulse space-y-2">
            <div className="h-3 w-full rounded bg-surface-raised" />
            <div className="h-3 w-11/12 rounded bg-surface-raised" />
            <div className="h-3 w-2/3 rounded bg-surface-raised" />
          </div>
        ) : (
          <p className="mt-4 text-sm text-foreground-muted">No biography available yet.</p>
        )}
      </div>
    </div>
  );
}
