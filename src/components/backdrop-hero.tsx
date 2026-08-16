"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import Image from "@/components/ui/fade-image";
import { BackButton } from "@/components/ui/back-button";

/**
 * The movie detail page's full-bleed backdrop, trailer-aware. With a
 * trailer available, it starts playing immediately on load -- muted, so
 * every browser's autoplay policy allows it without any tap (autoplay
 * WITH sound is blocked everywhere unless it follows a user gesture, but
 * autoplay muted is universally allowed, including iOS Safari/WebKit as
 * long as `playsinline` is set). A small speaker toggle lets people opt
 * into sound; an X lets them dismiss the trailer back to the plain still.
 * `playing` defaults to true whenever a trailer exists, so this always
 * autoplays fresh on every movie page visit -- since BackdropHero remounts
 * per movie (new trailerKey prop), there's no stale "closed" state
 * carried over from a previously-viewed title.
 */
export function BackdropHero({
  backdropUrl,
  trailerKey,
  title,
}: {
  backdropUrl: string;
  trailerKey: string | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(Boolean(trailerKey));
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // enablejsapi=1 in the iframe src (below) makes YouTube's player post
  // status messages back to this window -- listening for onError here
  // catches the cases no embed parameter can prevent: embedding disabled
  // by the uploader, age-restricted content, region blocks, or a video
  // pulled after TMDB indexed it. Every one of those makes YouTube render
  // its own "watch on YouTube" card with the red play button instead of
  // actually autoplaying, which is exactly the broken state this is
  // meant to catch -- falling back to the plain backdrop image means
  // that red button is never visible, only ever a clean still if a
  // trailer can't play. Scoped to messages from YouTube specifically
  // (event.origin check) since postMessage is a shared, unauthenticated
  // channel any other script on the page could also post to.
  useEffect(() => {
    if (!trailerKey) return;
    function handleMessage(event: MessageEvent) {
      if (event.origin !== "https://www.youtube.com") return;
      let data: unknown;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data && typeof data === "object" && "event" in data && (data as { event: unknown }).event === "onError") {
        setPlaying(false);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [trailerKey]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    // Every YouTube embed listens for these postMessage commands as long
    // as enablejsapi=1 is in its src, even without loading the separate
    // IFrame Player API script -- so we can flip mute state in place
    // instead of reloading the iframe (which would restart the video).
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: next ? "mute" : "unMute", args: [] }),
      "*"
    );
  }

  return (
    /* The nav bar is `sticky top-0` -- in normal document flow, not an
       overlay -- so it reserves its own h-14 (56px) of space above
       whatever comes next. Pulling this hero up by that same amount
       (and growing its height to match) makes the backdrop image
       extend underneath the nav's reserved space instead of stopping
       right below it. That matters because the nav auto-hides on idle
       (see nav-bar.tsx): without this, sliding the nav away just
       reveals blank page background where it used to sit; with it,
       sliding the nav away reveals more of the actual backdrop/trailer
       instead. */
    <div className="group relative -mt-14 h-[436px] w-full overflow-hidden sm:h-[636px]">
      {playing && trailerKey ? (
        <>
          {/* The hero box is deliberately much wider than it is tall (up to
              ~5.7:1 on a wide monitor) -- nothing like a video's native
              16:9, the same "wrong fit" problem the backdrop still image
              had before object-cover. Sizing the iframe to 100vw wide by
              its true 16:9 height (56.25vw) and centering it always
              yields a height taller than this box, so the parent's
              overflow-hidden crops the vertical excess -- the iframe
              equivalent of object-fit: cover.

              scale-125 on top of that crops a further, equal slice off
              every edge (a pure geometric zoom, not a covering layer) --
              specifically to push YouTube's own title/channel header
              row, which is pinned to the iframe's own top edge and can't
              be disabled via any embed parameter, up above the visible
              bounds regardless of screen size. controls=0 already means
              nothing meaningful sits at the very bottom either, so the
              equal slice cropped there is harmless. pointer-events-none
              means the video (including YouTube's own center play icon)
              is never directly tappable -- the mute/close buttons below
              are the only interactive controls layered on top. */}
          <iframe
            ref={iframeRef}
            className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[100vw] origin-center scale-125 -translate-x-1/2 -translate-y-1/2 border-0"
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&rel=0&playsinline=1&enablejsapi=1&modestbranding=1&controls=0&disablekb=1&fs=0&iv_load_policy=3`}
            title={`${title} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
          {/* Bottom fade so the hard edge at the base of the hero (very
              visible on high-contrast trailer intros -- rating cards,
              title-card frames, black-and-white cold opens) reads as an
              intentional transition into the page rather than a video
              getting chopped off mid-frame. Tall and two-stop so the
              title row (which overlaps this zone -- see the negative
              margin on movie/[id]/page.tsx's content wrapper) reads
              cleanly against the image the whole way up, not just right
              at the very bottom edge. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/70 to-transparent sm:h-64" />
          <div
            // top offset clears the nav bar's own h-14 (56px) reserved
            // space -- this hero now starts 56px higher (-mt-14, see the
            // comment on the root div above) so a plain top-3 would sit
            // right under/behind the nav instead of below it.
            className="absolute left-3 top-[68px] z-10"
          >
            <BackButton />
          </div>
          <div className="absolute right-3 top-[68px] z-10 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute trailer" : "Mute trailer"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setPlaying(false)}
              aria-label="Close trailer"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
            >
              <X size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          {/* This box's aspect ratio (up to ~5.7:1 on a wide monitor) is
              nothing like a backdrop's native ~16:9, unlike every poster
              box elsewhere in the app which is deliberately sized to
              aspect-[2/3] to match its source image exactly (see
              hero-recommendation.tsx's comment on the same class of bug).
              object-cover's default center crop was therefore cutting
              roughly the top and bottom quarters off the image in equal
              amounts — and since character-forward backdrops (a person
              standing, key art with faces near the top third) put their
              important content well above center, that consistently cut
              faces off on wide screens. object-top biases the crop to
              preserve the top of the frame instead of centering it, which
              is right far more often than dead-center for this kind of
              art across the whole catalogue, not just one title. */}
          <Image
            src={backdropUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-top"
          />
          {/* Top scrim keeps the nav bar legible over a bright backdrop.
              Bottom fade is tall and two-stop so the title/poster row
              (which overlaps the bottom of this hero via a negative
              margin on the content wrapper below) reads cleanly against
              the image the whole way up, not just right at the bottom
              edge. */}
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/70 to-transparent sm:h-64" />
          <div className="absolute left-3 top-[68px] z-10">
            <BackButton />
          </div>
        </>
      )}
    </div>
  );
}
