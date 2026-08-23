"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import Image from "@/components/ui/fade-image";
import { BackButton } from "@/components/ui/back-button";
import { siteOrigin } from "@/lib/seo/site";

// Passed to YouTube as the player's origin (see loadYouTubeIframeApi below)
// so its postMessage-based remote-control validates reliably. WKWebView
// (the native iOS app's embedded browser) doesn't always send a reliable
// Referer header on iframe loads, which is what YouTube falls back to for
// origin validation when this isn't set explicitly.
const PRODUCTION_ORIGIN = siteOrigin();

// Minimal typing for the subset of the YouTube IFrame Player API this file
// actually uses -- there's no @types package for it, and pulling in the
// full API surface isn't worth it for four methods and one enum.
interface YTPlayer {
  playVideo: () => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}
interface YTPlayerEvent {
  target: YTPlayer;
  data?: number;
}
interface YTNamespace {
  Player: new (
    element: HTMLElement,
    config: {
      width?: string | number;
      height?: string | number;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: YTPlayerEvent) => void;
        onStateChange?: (event: YTPlayerEvent) => void;
        onError?: (event: YTPlayerEvent) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: { PLAYING: number; ENDED: number; PAUSED: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Loads YouTube's IFrame Player API script once and resolves with the
// resulting window.YT namespace -- shared across every BackdropHero
// instance/remount rather than injecting a fresh <script> tag per movie
// page visit. This replaces an earlier version of this file that built a
// bare <iframe src="...?enablejsapi=1"> by hand and drove it with raw,
// untyped postMessage() calls (a manual mute/playVideo "forcePlay()"
// retried on a timer). That approach worked in ordinary desktop/mobile
// Safari but proved unreliable specifically inside the native iOS app's
// WKWebView -- the iframe loaded and YouTube's player initialized fine,
// but the hand-rolled postMessage commands were silently dropped, leaving
// YouTube's own red "click to play" button frozen on screen. YT.Player is
// the officially documented way to control an embed: it manages the
// postMessage handshake itself (an undocumented, unreliable protocol if
// done by hand) and exposes real methods (playVideo(), mute()) instead of
// guessing at raw command messages.
let youtubeApiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT as YTNamespace);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  // Set once the player actually confirms it's alive (onReady or a
  // PLAYING state change) -- used below to cancel the "stuck" fallback
  // timer once there's real signal the embed is working.
  const [playerStarted, setPlayerStarted] = useState(false);

  // Creates the real YT.Player instance against the container div below,
  // instead of hand-building an iframe src string -- see the comment on
  // loadYouTubeIframeApi for why. autoplay/mute/playsinline are passed as
  // playerVars (the API's own config surface) rather than URL params; the
  // library builds the actual embed URL itself. Re-runs per trailerKey,
  // matching the rest of this component (BackdropHero remounts fresh per
  // movie, so there's no stale player to reuse across titles).
  useEffect(() => {
    if (!trailerKey) return;
    let cancelled = false;
    loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        width: "100%",
        height: "100%",
        videoId: trailerKey,
        playerVars: {
          autoplay: 1,
          mute: 1,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          origin: PRODUCTION_ORIGIN,
        },
        events: {
          onReady: (event) => {
            setPlayerStarted(true);
            // Belt and suspenders: autoplay=1 in playerVars should be
            // enough on its own, but explicitly calling these through the
            // API's real methods (not postMessage guesswork) costs
            // nothing and catches any platform where the URL param alone
            // doesn't take.
            event.target.mute();
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) setPlayerStarted(true);
          },
          // Covers YouTube's own explicit rejections: embedding disabled
          // by the uploader, age-restricted content, region blocks, or a
          // video pulled after TMDB indexed it. Falling back to the plain
          // backdrop image means YouTube's red "watch on YouTube" card is
          // never visible, only ever a clean still if a trailer can't
          // play.
          onError: () => setPlaying(false),
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [trailerKey]);

  // Safety net for a trailer that never actually starts: onError above
  // only fires for YouTube's own explicit rejections. If something else
  // keeps the player from ever coming up (an ad/privacy-blocking browser
  // extension, a flaky connection, a captive network), no onReady/onError
  // ever fires and this hero would be left showing a black box
  // indefinitely -- worse than not attempting a trailer at all. 15s
  // (rather than a shorter window) gives native/slower conditions
  // realistic room -- on iOS the gap between the request landing and the
  // embedded player actually being up is measurably longer than on
  // desktop -- while still catching a trailer that's genuinely never
  // going to load.
  useEffect(() => {
    if (!playing || !trailerKey) return;
    const timer = window.setTimeout(() => {
      if (!playerStarted) setPlaying(false);
    }, 15000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on trailerKey (fresh timer per title), playerStarted intentionally read fresh via closure rather than restarting the timer on every state flip
  }, [trailerKey, playing]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (next) {
      playerRef.current?.mute();
    } else {
      playerRef.current?.unMute();
    }
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
              had before object-cover. Sizing this box to 100vw wide by
              its true 16:9 height (56.25vw) and centering it always
              yields a height taller than the hero, so the parent's
              overflow-hidden crops the vertical excess -- the video
              equivalent of object-fit: cover.

              scale-125 on top of that crops a further, equal slice off
              every edge (a pure geometric zoom, not a covering layer) --
              specifically to push YouTube's own title/channel header
              row, which is pinned to the player's own top edge and can't
              be disabled via any embed parameter, up above the visible
              bounds regardless of screen size. controls=0 already means
              nothing meaningful sits at the very bottom either, so the
              equal slice cropped there is harmless. pointer-events-none
              means the video (including YouTube's own center play icon)
              is never directly tappable -- the mute/close buttons below
              are the only interactive controls layered on top.

              YT.Player injects its own iframe into this div (see the
              effect above) sized to width/height: "100%" -- the arbitrary
              child selector below forces that injected iframe to actually
              fill the container regardless of what attributes the library
              sets on it directly. */}
          <div
            ref={containerRef}
            aria-label={`${title} trailer`}
            className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[100vw] origin-center scale-125 -translate-x-1/2 -translate-y-1/2 [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:h-full [&>iframe]:w-full [&>iframe]:border-0"
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
