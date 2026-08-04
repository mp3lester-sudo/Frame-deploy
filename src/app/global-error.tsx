"use client";

// Catches errors thrown in the root layout itself (e.g. the auth/profile
// lookups in layout.tsx throwing) -- the one class of error error.tsx
// can't catch, since error.tsx is rendered *inside* the root layout and
// can't recover from the layout failing. Next.js requires this file to
// render its own <html>/<body> since it fully replaces the root layout,
// which means globals.css isn't loaded here -- Tailwind classes won't
// work, so this uses inline styles with the same wine/gold palette
// hardcoded, matched from globals.css's --background/--foreground/
// --accent-gradient values. Rare in practice, but the alternative
// (Next's default unstyled crash page with zero navigation back into
// the app) is worse than a little duplicated color literals.
import { useEffect } from "react";
import { captureClientError } from "@/lib/monitoring/sentry-client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureClientError(error, { digest: error.digest, boundary: "root-layout" });
  }, [error]);

  return (
    <html>
      <body
        style={{
          background: "#120708",
          color: "#f2e9df",
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.125rem", fontWeight: 500, margin: 0 }}>Something went seriously wrong.</h1>
        <p style={{ maxWidth: 380, fontSize: "0.875rem", color: "#ab949a", margin: 0 }}>
          Backlot hit an unexpected error and couldn&apos;t load. Try refreshing the page.
        </p>
        <button
          onClick={() => reset()}
          style={{
            background: "linear-gradient(135deg, #f3e3b8 0%, #d9b876 32%, #a9863f 68%, #e8cf99 100%)",
            color: "#2a0f14",
            padding: "0.5rem 1.25rem",
            borderRadius: 10,
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
