import type { NextConfig } from "next";

// Security headers, applied to every route via headers() below.
//
// script-src/style-src keep 'unsafe-inline' rather than switching to a
// nonce-based CSP: layout.tsx and page.tsx each render a couple of small,
// static, developer-authored inline <script> tags (see their own doc
// comments -- intro-video session state, cookie-banner CSS-in-state) to
// sidestep hydration mismatches, and Tailwind/inline `style={{...}}`
// attributes are used throughout for per-poster dynamic colors. A
// nonce-based CSP is the stricter option but needs per-request nonce
// plumbing through the root layout that doesn't exist yet -- tracked as a
// follow-up rather than done half-right here. 'unsafe-inline' still blocks
// the far more common XSS vector (an attacker's injected <script src=...>
// pointing at an external domain), just not an inline one.
//
// connect-src lists every origin the client actually talks to directly:
// Supabase (REST + the Realtime websocket used by Movie Night's live
// voting/participants and Watch Together), PostHog, and Sentry's ingest
// hosts (wildcarded since the exact regional ingest subdomain varies by
// DSN and isn't known at build time). TMDB/OMDB/OpenAI are server-only
// fetches (see src/lib/external, src/lib/ai) and never called from the
// browser, so they don't belong in a CSP that only governs browser-issued
// requests. Stripe Checkout is a full top-level redirect to a URL Stripe
// returns (see src/app/api/stripe/checkout/route.ts), not an embedded
// frame or client-side script, so it needs no CSP entry either -- the
// browser simply navigates away to checkout.stripe.com's own page, which
// serves its own headers.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.youtube.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://*.posthog.com https://*.sentry.io",
  "frame-src https://www.youtube.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // TMDB poster/backdrop CDN
      { protocol: "https", hostname: "image.tmdb.org" },
      // Supabase Storage (avatars, uploads)
      { protocol: "https", hostname: "*.supabase.co" },
      // Trade-press article thumbnails (Indie Spotlight news cards) --
      // media:thumbnail URLs come straight off variety.com/deadline.com's
      // own domain, og:image scrapes off indiewire.com/hollywoodreporter.com's.
      // Wildcards cover the occasional CDN subdomain these WordPress VIP
      // sites serve responsive images from, alongside the bare domain.
      { protocol: "https", hostname: "*.variety.com" },
      { protocol: "https", hostname: "variety.com" },
      { protocol: "https", hostname: "*.deadline.com" },
      { protocol: "https", hostname: "deadline.com" },
      { protocol: "https", hostname: "*.indiewire.com" },
      { protocol: "https", hostname: "*.hollywoodreporter.com" },
    ],
    // AVIF/WebP are meaningfully smaller than the source JPEGs TMDB serves
    // (posters/backdrops are the single largest asset class on nearly
    // every page -- home, discover, movie detail, profile banners).
    // Next tries formats in order and falls back to the original if the
    // requesting browser doesn't support either.
    formats: ["image/avif", "image/webp"],
    // TMDB poster/backdrop URLs are immutable (a given path never changes
    // its image), so a long cache TTL is safe and avoids re-fetching/
    // re-optimizing the same poster on every cold cache hit.
    minimumCacheTTL: 2678400, // 31 days
  },
  experimental: {
    // Next's default Server Action body size cap is 1MB. The Letterboxd
    // diary paste/upload import (importLetterboxdPaste) can legitimately
    // exceed that — a single saved "Complete Webpage" of a Diary page, or a
    // full page-source paste, is often several hundred KB on its own before
    // even considering someone dropping in multiple pages at once. Exceeding
    // the default cap silently fails at the framework level with a generic,
    // digest-only "Server Components render" error that gives the user (and
    // us) no indication it was a size problem — this is a backstop, not the
    // primary fix (the import UI now shrinks payloads client-side first, see
    // src/lib/import/extract-diary-fragments.ts), but it's a cheap safety
    // net for any path that ends up sending a large raw payload.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // No feature on any page currently needs any of these --
            // camera/mic/geolocation/payment/usb are all denied outright
            // rather than left to browser defaults.
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
