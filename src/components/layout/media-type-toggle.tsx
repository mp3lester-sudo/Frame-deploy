"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Film, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEDIA_TYPE_COOKIE, type MediaType } from "@/lib/context/media-type-cookie";
import { hasAnyRatingsForType } from "@/lib/actions/onboarding";

const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // a year -- this is a standing preference, not a session-scoped one

/**
 * Movies/Shows segmented toggle -- the single control that decides which
 * half of the catalogue every other feature on the site (Discover, Home,
 * Ask Marquee, Movie Night, Wrapped, Marquee DNA) filters against, and
 * which color palette (see globals.css's [data-media="tv"] block) is
 * active. Lives in the nav bar so it's reachable from every page, on
 * every screen size -- unlike the desktop-only link row next to it.
 *
 * "Palette preview split" treatment: each half is permanently tinted
 * toward the palette it switches you *into* -- gold on Movies, icy blue
 * on Shows -- all the time, not just when active. The inactive half
 * dims/desaturates rather than going flat gray, so the control itself
 * reads as a small live swatch of both destinations instead of a plain
 * label. Uses the fixed --movie-accent/--tv-accent tokens in globals.css
 * (declared once in :root, never overridden), since the ordinary
 * --accent token only ever holds whichever single palette is currently
 * active site-wide and can't represent both colors at once.
 *
 * Writes a plain (non-httpOnly) cookie directly from the browser, same
 * pattern as precise-location.tsx: no server round trip needed just to
 * flip a preference. router.refresh() re-runs every server component on
 * the current route against the new cookie value rather than a full page
 * reload, so scroll position / client state elsewhere on the page survives
 * the switch.
 */
export function MediaTypeToggle({ active }: { active: MediaType }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setMediaType(next: MediaType) {
    if (next === active) return;
    document.documentElement.setAttribute("data-media", next);
    document.cookie = `${MEDIA_TYPE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    startTransition(async () => {
      // "Fully separate profiles" -- switching into a mode this account
      // has zero ratings in gets the same taste-check swipe flow a brand
      // new signup gets (see /onboarding), instead of landing on an empty
      // cold-start feed with no way to seed a taste vector for that mode.
      // The cookie write above already happened, so /onboarding's own
      // getActiveMediaType() read sees `next`, not the value being left.
      const hasRatings = await hasAnyRatingsForType(next);
      if (!hasRatings) {
        router.push("/onboarding");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Movies or Shows"
      className={cn(
        "flex items-center overflow-hidden rounded-[var(--radius-md)] border border-border transition-opacity",
        isPending && "opacity-70"
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active === "movie"}
        onClick={() => setMediaType("movie")}
        className={cn(
          "media-toggle-movie flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-[opacity,filter,transform] duration-300 sm:px-3",
          active === "movie"
            ? "scale-[1.02] text-[var(--movie-accent-soft)] opacity-100 saturate-100"
            : "text-[var(--movie-accent-soft)] opacity-45 saturate-50 hover:opacity-70"
        )}
      >
        <Film size={13} />
        <span className="hidden sm:inline">Movies</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={active === "tv"}
        onClick={() => setMediaType("tv")}
        className={cn(
          "media-toggle-tv flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-[opacity,filter,transform] duration-300 sm:px-3",
          active === "tv"
            ? "scale-[1.02] text-[var(--tv-accent-soft)] opacity-100 saturate-100"
            : "text-[var(--tv-accent-soft)] opacity-45 saturate-50 hover:opacity-70"
        )}
      >
        <Tv size={13} />
        <span className="hidden sm:inline">Shows</span>
      </button>
    </div>
  );
}
