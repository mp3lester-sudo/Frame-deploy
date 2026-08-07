"use client";

import { useState } from "react";

/**
 * Plain <img>, not next/image -- the source is an arbitrary external
 * article's own og:image (see lib/news/article-image.ts), whose host
 * isn't and can't practically be pre-registered in next.config.ts's
 * remotePatterns the way TMDB/Supabase are. Hides itself on a load error
 * (dead link, a site blocking hotlinking) rather than showing a broken
 * image icon.
 */
export function ArticleThumbnail({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
}
