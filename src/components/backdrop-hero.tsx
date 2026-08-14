"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X, Play, Pause } from "lucide-react";
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
  // Optimistic true: muted autoplay succeeds essentially everywhere, so
  // assuming "playing" from the first frame means our custom button shows
  // the right icon immediately instead of a flash of the wrong one --
  // the postMessage listener below corrects this the moment YouTube
  // reports otherwise (still buffering, blocked, etc).
  const [videoPlaying, setVideoPlaying] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  function togglePlay() {
    const next = !videoPlaying;
    setVideoPlaying(next);
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: next ? "playVideo" : "pauseVideo", args: [] }),
      "*"
    );
  }

  useEffect(() => {
    if (!playing || !trailerKey) return;
    // YouTube's embed broadcasts { event: "infoDelivery", info: { playerState } }
    // on the iframe's own contentWindow origin once enablejsapi=1 is set --
    // no separate IFrame Player API script or "listening" handshake
    // required, the same reason toggleMute() above can already post
    // commands to it directly. playerState 1 is "playing"; every other
    // value (buffering, paused, cued, ended) should show our button in
    // its "tap to play" state instead of falsely claiming to be playing.
    function onMessage(event: MessageEvent) {
      if (typeof event.data !== "string") return;
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (
        typeof data === "object" &&
        data !== null &&
        (data as { event?: unknown }).event === "infoDelivery" &&
        typeof (data as { info?: { playerState?: unknown } }).info?.playerState === "number"
      ) {
        setVideoPlaying((data as { info: { playerState: number } }).info.playerState === 1);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playing, trailerKey]);

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
              had before object-cover. This is the iframe equivalent of
              object-fit: cover: since this hero is full-bleed (100vw wide,
              no side padding), sizing the iframe to 100vw wide by its true
              16:9 height (56.25vw) and centering it always yields a height
              taller than this box, so the parent's overflow-hidden crops
              the vertical excess instead of letterboxing or squashing the
              video the way a plain inset-0 fill would.

              controls=0 strips YouTube's persistent play/pause bar,
              scrubber, volume, and fullscreen button during active
              playback; disablekb and fs=0 close off the keyboard- and
              fullscreen-button paths to the same chrome; iv_load_policy=3
              suppresses annotation cards. pointer-events-none means the
              video/YouTube's own center play button can never register a
              tap -- our own play/pause button below, positioned exactly
              over where that icon would render, is the only way to
              control playback, and unlike YouTube's it actually works
              (postMessage playVideo/pauseVideo, same technique the mute
              button already uses) and carries Backlot's own branding
              instead of a generic triangle. */}
          <iframe
            ref={iframeRef}
            className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[100vw] -translate-x-1/2 -translate-y-1/2 border-0"
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&rel=0&playsinline=1&enablejsapi=1&modestbranding=1&controls=0&disablekb=1&fs=0&iv_load_policy=3`}
            title={`${title} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
          {/* Permanent cover for YouTube's own title/channel header row --
              sized generously (well past where that header renders on any
              screen, including a long title + channel name wrapping to
              two lines) since a zoom/scale-based crop was tried here
              first and, while it did hide the header, made the whole
              video read as oddly zoomed in with no way to see the full
              frame -- a real regression, not just a smaller version of
              the same fix. A tall, hard-edged, non-scaling cover doesn't
              touch the video's own framing at all. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-32 bg-background sm:h-40" />
          <div className="pointer-events-none absolute inset-x-0 top-32 z-[5] h-10 bg-gradient-to-b from-background to-transparent sm:top-40 sm:h-12" />
          <div className="pointer-events-none absolute left-1/2 top-4 z-[6] -translate-x-1/2 sm:top-5">
            <span className="text-gold-foil font-hollywood text-base uppercase tracking-[0.1em] sm:text-lg">
              Backlot
            </span>
          </div>
          {/* Backlot's own play/pause control, centered exactly where
              YouTube's own (non-interactive, pointer-events-none) icon
              would otherwise show -- covers it visually and replaces it
              functionally. z-[6] keeps it above the header cover's fade
              (z-[5]) and the iframe itself. */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={videoPlaying ? "Pause trailer" : "Play trailer"}
            className="absolute left-1/2 top-1/2 z-[6] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-gold-foil bg-background/70 text-gold-foil backdrop-blur transition-transform hover:scale-105 active:scale-95"
          >
            {videoPlaying ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-1" />}
          </button>
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
