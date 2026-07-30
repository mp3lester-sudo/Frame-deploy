"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
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
 */
export default function FadeImage({ className, onLoad, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Image
      {...props}
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
