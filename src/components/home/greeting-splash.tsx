"use client";

import { useState } from "react";

const SESSION_KEY = "backlot:greeting-splash-shown";

/**
 * A brief, full-screen "Good morning, Michael." title card shown once
 * per browser session on first entry to the (already server-rendered)
 * home page -- fades in, holds, fades out via the .greeting-splash
 * keyframe in globals.css, then unmounts to reveal the recommendations
 * underneath. The home page's own content and data are already present
 * in the DOM the whole time; this is a purely visual overlay, not a
 * loading gate, so there's no extra wait behind it.
 *
 * Session-scoped via sessionStorage so it reads as an entrance the
 * first time the app is opened in a tab, not a wall you sit through
 * every time a client-side navigation lands back on "/".
 */
export function GreetingSplash({ greeting, firstName }: { greeting: string; firstName: string }) {
  // Lazy initializer runs during the first client render (before paint),
  // so the splash is either present or absent from the very first frame
  // -- no flash of the home page followed by the overlay snapping in.
  const [show, setShow] = useState(() => {
    if (typeof window === "undefined") return false;
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    sessionStorage.setItem(SESSION_KEY, "1");
    return true;
  });

  if (!show) return null;

  return (
    <div
      className="greeting-splash pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background"
      aria-hidden="true"
      onAnimationEnd={() => setShow(false)}
    >
      <h1 className="text-4xl sm:text-5xl">
        <span className="font-sans font-medium text-foreground">{greeting}</span>,{" "}
        <span className="marquee-bulbs font-marquee text-3xl uppercase tracking-wide sm:text-4xl">
          {firstName}
        </span>
        .
      </h1>
    </div>
  );
}
