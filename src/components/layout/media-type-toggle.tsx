"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Film, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import { MEDIA_TYPE_COOKIE, type MediaType } from "@/lib/context/media-type-cookie";

const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // a year -- this is a standing preference, not a session-scoped one

/**
 * Movies/Shows segmented toggle -- the single control that decides which
 * half of the catalogue every other feature on the site (Discover, Home,
 * Ask Marquee, Movie Night, Wrapped, Marquee DNA) filters against, and
 * which color palette (see globals.css's [data-media="tv"] block) is
 * active. Lives in the nav bar so it's reachable from every page, on
 * every screen size -- unlike the desktop-only link row next to it.
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
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="radiogroup"
      aria-label="Movies or Shows"
      className={cn(
        "flex items-center gap-0.5 rounded-[var(--radius-full)] border border-border bg-surface p-0.5 transition-opacity",
        isPending && "opacity-70"
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={active === "movie"}
        onClick={() => setMediaType("movie")}
        className={cn(
          "flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors sm:px-3",
          active === "movie" ? "bg-accent text-accent-foreground" : "text-foreground-muted hover:text-foreground"
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
          "flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors sm:px-3",
          active === "tv" ? "bg-accent text-accent-foreground" : "text-foreground-muted hover:text-foreground"
        )}
      >
        <Tv size={13} />
        <span className="hidden sm:inline">Shows</span>
      </button>
    </div>
  );
}
