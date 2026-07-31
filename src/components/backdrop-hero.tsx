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
    <div className="group relative h-[240px] w-full overflow-hidden sm:h-[360px]">
      {playing && trailerKey ? (
        <>
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0`}
            title={`${title} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <button
            type="button"
            onClick={() => setPlaying(false)}
            aria-label="Close trailer"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background"
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
          {/* Fade the backdrop into the page background so the poster/title
              row below sits on solid ground, not mid-photo. Cinematic
              atmosphere without fighting legibility. */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-transparent" />

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
