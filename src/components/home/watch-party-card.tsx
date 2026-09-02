import { Users } from "lucide-react";
import { createMovieNight } from "@/lib/actions/movie-night";
import { movieNightLabel } from "@/lib/copy/movie-night-copy";
import type { MediaType } from "@/lib/context/media-type-cookie";

/**
 * Quiet call-to-action row promoting Movie Night (Watch Party in Shows
 * mode) directly from Home, sitting between the solo recommendation rail
 * and the curated "Tonight" section below it -- home page redesign
 * (rendition D). Deliberately styled to echo the hero's own tap-to-reveal
 * CTA language (pill button, uppercase tracked label, hairline border)
 * rather than introducing a third button style, so the page's two real
 * actions -- watch the hero pick, or start a group session -- read as a
 * matched pair. No fabricated "who's already in" avatars here: unlike an
 * existing session with real participants, this always creates a brand
 * new one (see createMovieNight), so there's no one to show yet.
 */
export function WatchPartyCard({ mediaType }: { mediaType: MediaType }) {
  const label = movieNightLabel(mediaType);
  return (
    <form action={createMovieNight} className="bento-card flex items-center gap-3 p-3">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent"
        aria-hidden="true"
      >
        <Users className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium text-foreground">Start a {label}</p>
        <p className="mt-0.5 truncate text-[11px] text-foreground-muted">Blend taste with friends, decide together</p>
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-[var(--radius-full)] border border-border-strong bg-white/[0.04] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground transition-colors hover:border-accent/50"
      >
        Start
      </button>
    </form>
  );
}
