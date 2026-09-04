"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Was missing entirely on the movie detail page -- fine in a normal
 * browser tab (the OS/browser chrome always has its own back button,
 * and iOS Safari also supports an edge-swipe gesture), but the native
 * iOS app has NO browser chrome at all (see mobile-app/capacitor.config.ts
 * -- it's a bare WKWebView pointed at the live site), so tapping into a
 * movie from Discover left native users with no visible way back
 * whatsoever. router.back() covers the normal case (arrived via an
 * in-app link, real navigation history exists); the href fallback covers
 * a page landed on directly (a shared link, or the very first screen in
 * a fresh app session) where there's no history to go back to -- without
 * it, back() on an empty history stack does nothing and the button would
 * appear to be broken.
 */
export function BackButton({
  fallbackHref = "/discover",
  className = "",
}: {
  fallbackHref?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      aria-label="Back"
      className={`glass-icon-btn flex h-9 w-9 items-center justify-center rounded-full text-foreground ${className}`}
    >
      <ArrowLeft size={18} />
    </button>
  );
}
