"use client";

import { useState } from "react";
import { Play, X } from "lucide-react";
import Image from "@/components/ui/fade-image";

/**
 * The movie detail page's full-bleed backdrop, now trailer-aware. With no
 * trailer available this renders exactly as before (just the still, faded
 * into the page background). With one available, hovering reveals a "Play
 * trailer" pill; clicking it swaps the still for a real YouTube embed in
 * place, autoplaying WITH sound — allowed by every browser's autoplay
 * policy here because it's a direct result of a user click, unlike an
 * autoplay-on-hover video would be (which most browsers block or force
 * mute, and which reads as noisy/gimmicky on a page you're just skimming).
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
  const [playing, setPlaying] = useState(false);

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
              video the way a plain inset-0 fill would. */}
          <iframe
            className="absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[100vw] -translate-x-1/2 -translate-y-1/2 border-0"
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0`}
            title={`${title} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
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
          <button
            type="button"
            onClick={() => setPlaying(false)}
            aria-label="Close trailer"
            // top offset clears the nav bar's own h-14 (56px) reserved
            // space -- this hero now starts 56px higher (-mt-14, see the
            // comment on the root div above) so a plain top-3 would sit
            // right under/behind the nav instead of below it.
            className="absolute right-3 top-[68px] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
          >
            <X size={18} />
          </button>
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

          {trailerKey && (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <span className="flex items-center gap-2 rounded-[var(--radius-full)] border border-accent/60 bg-background/70 px-5 py-2.5 text-sm font-medium text-accent backdrop-blur transition-colors hover:bg-background/90">
                <Play size={16} fill="currentColor" />
                Play trailer
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
