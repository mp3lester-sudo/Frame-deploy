"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

// Same "away 30+ min counts as a fresh app open" definition the
// cinematic intro uses (page.tsx), and the same localStorage-with-
// timestamp mechanism -- not sessionStorage. sessionStorage is what
// PromoBanner (the existing slim under-nav strip) already uses, but the
// intro's own doc comment explains why that choice doesn't hold up in
// the native iOS app: WKWebView can keep a sessionStorage flag alive
// indefinitely across a full force-quit + relaunch, which would mean
// this popup fires once ever on a given device instead of once per
// real app open. Building it correctly from the start avoids
// reintroducing a bug that's already been found and fixed once here.
const STALE_MS = 30 * 60 * 1000;
const LAST_SHOWN_KEY = "slate:premium-popup-shown-at";

// Give the intro's own fade / the home page's first paint a beat to
// settle before popping this in on top of them, whether the intro just
// played (long delay) or wasn't going to play at all this "session"
// (short delay) -- either way this shouldn't be the very first thing
// someone sees.
const POST_DISMISS_DELAY_MS = 900;

/**
 * A single popup nudge toward Slate Premium on app open, layered on top
 * of (not instead of) the existing slim PromoBanner -- that banner stays
 * as the quiet, persistent reminder; this is the one attention-grabbing
 * moment per "session." Rendered by layout.tsx under the same
 * signed-in-and-not-Premium condition PromoBanner already uses.
 *
 * Waits for the home page's cinematic intro to actually finish (or to
 * have been skipped this session) before showing -- see the
 * MutationObserver below -- rather than racing it, since both are
 * full-screen-ish overlays and showing this while the intro's tapzone
 * (z-[60]) is still live would either get instantly covered or block
 * the intro from being dismissed normally.
 */
export function PremiumPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | undefined;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      const now = Date.now();
      const lastShown = localStorage.getItem(LAST_SHOWN_KEY);
      if (lastShown && now - parseInt(lastShown, 10) < STALE_MS) {
        return;
      }

      function reveal() {
        if (cancelled) return;
        try {
          localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
        } catch {
          // Storage unavailable (private browsing, quota, etc) -- still
          // show it this once, just don't persist the "already shown"
          // flag; worst case it can show again next load rather than
          // silently never showing at all.
        }
         
        setOpen(true);
      }

      const root = document.documentElement;
      const introAlreadyDone =
        root.classList.contains("intro-shown") || root.classList.contains("cinematic-intro-dismissed");

      if (introAlreadyDone) {
        revealTimer = setTimeout(reveal, POST_DISMISS_DELAY_MS);
      } else if (root.querySelector("#cinematic-intro-tapzone")) {
        // Intro is present and hasn't been dismissed yet -- wait for the
        // class its own dismiss handler adds (page.tsx) rather than
        // guessing at a timeout.
        observer = new MutationObserver(() => {
          if (root.classList.contains("cinematic-intro-dismissed")) {
            observer?.disconnect();
            revealTimer = setTimeout(reveal, POST_DISMISS_DELAY_MS);
          }
        });
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
      } else {
        // No intro markup on this page at all (e.g. not on Home) --
        // nothing to wait for.
        revealTimer = setTimeout(reveal, POST_DISMISS_DELAY_MS);
      }
    } catch {
      // localStorage unavailable -- don't show rather than risk showing
      // on every single load with no memory of having shown already.
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (revealTimer) clearTimeout(revealTimer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-popup-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 px-6 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-[var(--radius-xl)] border border-accent/30 bg-[var(--glass-bg)] p-6 text-center backdrop-blur-xl"
        style={{ boxShadow: "0 0 0 1px rgba(217,184,118,0.15), var(--glass-shadow)" }}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Dismiss"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-foreground-muted transition-colors hover:text-foreground"
        >
          <X size={16} />
        </button>

        <p className="text-[10px] uppercase tracking-[0.2em] text-foreground-muted">Slate presents</p>
        <h2 id="premium-popup-title" className="font-display mt-1 text-2xl italic text-accent-soft">
          Slate Premium
        </h2>
        <p className="mt-3 text-sm text-foreground-muted">
          Go ad-free and unlock monthly Wrapped, unlimited Ask Slate, and advanced filters.
        </p>

        <Link
          href="/premium"
          onClick={() => setOpen(false)}
          className="bg-gold-foil text-accent-foreground mt-5 inline-flex w-full items-center justify-center rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-medium shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_20px_-8px_rgba(205,166,70,0.55)] transition-all hover:brightness-110"
        >
          See Premium
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-3 block w-full text-xs text-foreground-muted transition-colors hover:text-foreground"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
