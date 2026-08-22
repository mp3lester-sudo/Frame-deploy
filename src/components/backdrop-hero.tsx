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
  // Declared up front (used by both the message listener below and the
  // fallback timeout further down) -- see the fallback timeout's own
  // comment for what this actually tracks.
  const [iframeLoaded, setIframeLoaded] = useState(false);
  // Guards forcePlay() below so it only fires once per trailer -- YouTube
  // posts frequent "infoDelivery" messages (playback time updates, etc.)
  // once the player is alive, and this listens for the FIRST one only as
  // the trigger, not every single one.
  const forcedPlayRef = useRef(false);

  // Explicitly commands the embed to play, instead of relying solely on
  // the autoplay=1 URL param. On the ordinary website that param is
  // enough on its own (that's what shipped in #275/#620), but inside the
  // native iOS app's WKWebView, a cross-origin iframe's own autoplay
  // permission doesn't reliably inherit the host app's -- the outer
  // iframe document loads fine and YouTube's player JS initializes fine
  // (both onLoad and the postMessage channel below fire normally), but
  // playback itself silently never starts, leaving YouTube's own
  // red-button "click to play" thumbnail frozen on screen instead --
  // exactly the bug this is fixing. Sent a few times on a short delay
  // (not just once) since a command dispatched the instant the player
  // signals "alive" can still arrive a beat before the player is
  // actually ready to accept it; each of these is a no-op if the video
  // is already playing, so repeating them is harmless.
  function forcePlay() {
    if (forcedPlayRef.current) return;
    forcedPlayRef.current = true;
    const send = () => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "mute", args: [] }),
        "*"
      );
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*"
      );
    };
    send();
    window.setTimeout(send, 300);
    window.setTimeout(send, 1000);
  }

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
      // Any message at all from the embed's own origin means the player
      // is alive and talking back to us -- not just the outer iframe
      // document loading (see iframeLoaded below), but YouTube's own JS
      // inside it having actually initialized. Treat that as "working"
      // before even checking what kind of message it is, so the fallback
      // timer below gets cancelled the moment there's real signal,
      // regardless of which specific event fires first. This matters on
      // iOS: WKWebView's cross-origin iframe `load` event can fire much
      // later relative to when the embedded player is actually up and
      // playing than it does in a desktop browser, so treating messages
      // as an earlier/more reliable "it's working" signal avoids the
      // fallback firing on a trailer that's actually fine.
      setIframeLoaded(true);
      forcePlay();
      if (data && typeof data === "object" && "event" in data && (data as { event: unknown }).event === "onError") {
        setPlaying(false);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [trailerKey]);

  // Safety net for a trailer that never actually starts: the onError
  // listener above only fires for YouTube's *own* explicit rejections
  // (embedding disabled, age-gated, region-blocked, video pulled) --
  // posted from inside the iframe's own document. If something outside
  // that channel keeps the iframe from ever loading in the first place
  // (an ad/privacy-blocking browser extension, a flaky connection, a
  // captive network), no postMessage ever arrives and this hero is left
  // showing a plain black box indefinitely, with no still image, no
  // error state, nothing -- worse than just not attempting a trailer at
  // all. `iframeLoaded` tracks the iframe's own document `load` event,
  // which requires nothing from YouTube's player JS and fires even when
  // the video itself is blocked, so it's a reliable enough signal that
  // the request at least reached the network. If that hasn't happened
  // within a generous window, fall back to the plain backdrop still --
  // exactly the same fallback path onError already uses, just reached
  // from "silently stuck" instead of "explicitly rejected".
  useEffect(() => {
    if (!playing || !trailerKey) return;
    // 15s, not 6s: this was originally tuned against a desktop browser
    // where an iframe that's ever going to load does so almost
    // immediately, so 6s comfortably separated "genuinely stuck" from
    // "loading normally." On iOS (native WKWebView), the gap between the
    // network request landing and the embedded player actually being up
    // is measurably longer, and 6s was firing on trailers that were
    // fine, just not fast -- silently killing autoplay that used to
    // work. 15s keeps the same safety net (a trailer that's truly never
    // going to load still gets caught) while giving slower/native
    // conditions realistic room, and the message listener above now
    // clears this the moment ANY signal comes back from the embed,
    // typically well under a second once it's actually alive.
    const timer = window.setTimeout(() => {
      if (!iframeLoaded) setPlaying(false);
    }, 15000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on trailerKey (fresh timer per title), iframeLoaded intentionally read fresh via closure rather than restarting the timer on every load-state flip
  }, [trailerKey, playing]);

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
            onLoad={() => {
              setIframeLoaded(true);
              // Fires forcePlay() from this path too, not just the message
              // listener above -- if YouTube's own player JS never gets
              // around to posting a message at all (the specific failure
              // this is guarding against also intermittently suppresses
              // that), the outer iframe's own load event still reliably
              // fires and this is the only other hook available to try.
              forcePlay();
            }}
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
