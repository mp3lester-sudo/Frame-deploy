"use client";

import { useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import Image from "@/components/ui/fade-image";

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
          {/* Two rounds of covering YouTube's own branded header (channel
              icon/title/subtitle, shown any time the embed isn't confirmed
              "playing") with an opaque band + wordmark didn't hold up on
              device -- the header can run to two lines for a long title +
              channel name, so a fixed-height cover was always guessing at
              a number that occasionally wasn't tall enough. Cropping it
              out geometrically instead of trying to paint over it removes
              that guesswork entirely.

              The iframe is already sized well past this box on every
              screen (100vw wide by its true 16:9 height, centered, with
              the parent's overflow-hidden cropping the excess -- the
              iframe equivalent of object-fit: cover, since this hero's own
              aspect ratio, up to ~5.7:1 on a wide monitor, is nothing like
              a video's native 16:9). scale-125 zooms that in further by a
              flat 25% around the same center point, which pushes the
              header -- pinned to the iframe's own top edge -- well above
              this box's visible top edge no matter how tall it renders,
              on every screen size, not just the ones we've screenshotted.
              It crops an equal slice off the bottom too, which is empty
              video frame (controls=0 already strips YouTube's play bar
              there) so nothing meaningful is lost.

              controls=0 strips YouTube's persistent play/pause bar,
              scrubber, volume, and fullscreen button during active
              playback; disablekb and fs=0 close off the keyboard- and
              fullscreen-button paths to the same chrome; iv_load_policy=3
              suppresses annotation cards. pointer-events-none means the
              video can never register a tap/click at all -- the mute and
              close buttons layered on top are the only interactive things
              in this hero. */}
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
            className="absolute right-3 top-[68px] z-10 flex items-center gap-2"
          >
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
        </>
      )}
    </div>
  );
}
