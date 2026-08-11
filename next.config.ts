import type { NextConfig } from "next";

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
};

export default nextConfig;
