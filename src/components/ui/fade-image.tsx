"use client";

import Image, { type ImageProps } from "next/image";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for next/image that fades images in once they've
 * actually decoded, instead of popping into place the instant the browser
 * paints them. Without this, a cold image-optimization cache (e.g. right
 * after a deploy) makes whole grids of posters snap in abruptly, which
 * reads as broken even though nothing failed — just a loading race.
 *
 * Usage: `import Image from "@/components/ui/fade-image"` — same API as
 * next/image, so no call sites need to change beyond the import line.
 *
 * Why the ref callback, not just onLoad: if the browser already has the
 * image in its HTTP cache (e.g. revisiting a page), it can decode and
 * paint the <img> before React finishes attaching the onLoad listener,
 * so `load` never fires and the image is stuck invisible forever. The
 * ref callback checks `img.complete` the moment the node mounts to catch
 * that case; onLoad remains the path for a genuine first-time fetch.
 */
export default function FadeImage({ className, onLoad, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);

  const checkAlreadyComplete = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    // `alt` is required by ImageProps and always supplied via the
    // {...props} spread below; the rule can't see through the spread to
    // confirm that statically.
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image
      {...props}
      ref={checkAlreadyComplete}
      className={cn(
        "transition-opacity duration-500 ease-out",
        loaded ? "opacity-100" : "opacity-0",
        className
      )}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
    />
  );
}
