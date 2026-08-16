"use client";

import Image, { type ImageProps } from "next/image";
import { useCallback, useRef, useState } from "react";
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
 *
 * Belt-and-suspenders opacity force (see `markLoaded` below): the fade
 * itself is a CSS transition tied to the `loaded` class flip, and that
 * transition can start and then simply never tick -- its animation
 * clock stuck at time zero, `opacity` pinned at its 0% starting frame
 * forever, even though the image behind it decoded perfectly fine. This
 * was caught live on the movie detail page's poster/backdrop: the
 * server payload and the decoded <img> were both correct (real pixels,
 * right dimensions), `loaded` was `true`, the class list said
 * `opacity-100` -- but `getComputedStyle` still reported `opacity: 0`,
 * and `img.getAnimations()` showed the transition's own Animation
 * object wedged at `localTime: 0` / `progress: 0`, "running" forever
 * without ever advancing. Same family of bug as the pull-to-refresh
 * spinner freezing mid-rotation: a browser animation clock that starts
 * but doesn't tick. A one-shot timeout slightly past the transition's
 * own 500ms duration reaches past the CSS machinery entirely and sets
 * the final opacity directly on the element, so a glitched transition
 * can never leave a fully-decoded image permanently invisible.
 */
export default function FadeImage({ className, onLoad, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const forcedRef = useRef(false);

  const markLoaded = useCallback(() => {
    setLoaded(true);
    if (forcedRef.current) return;
    forcedRef.current = true;
    window.setTimeout(() => {
      const img = imgRef.current;
      if (img && getComputedStyle(img).opacity !== "1") {
        img.style.opacity = "1";
      }
    }, 700);
  }, []);

  const setRefs = useCallback(
    (img: HTMLImageElement | null) => {
      imgRef.current = img;
      if (img && img.complete && img.naturalWidth > 0) {
        markLoaded();
      }
    },
    [markLoaded]
  );

  return (
    // `alt` is required by ImageProps and always supplied via the
    // {...props} spread below; the rule can't see through the spread to
    // confirm that statically.
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image
      {...props}
      ref={setRefs}
      className={cn(
        "transition-opacity duration-500 ease-out",
        loaded ? "opacity-100" : "opacity-0",
        className
      )}
      onLoad={(event) => {
        markLoaded();
        onLoad?.(event);
      }}
    />
  );
}
