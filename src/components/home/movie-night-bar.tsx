import { Clapperboard, Heart, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { createMovieNight } from "@/lib/actions/movie-night";
import { movieNightLabel } from "@/lib/copy/movie-night-copy";
import { getRecentFollowers } from "@/lib/social/followers";
import type { MediaType } from "@/lib/context/media-type-cookie";

/**
 * Home page redesign: replaces WatchPartyCard's single generic "Start"
 * button with two explicit start actions -- Date night / With friends --
 * reusing the exact two labels/icons ContextPicker already uses for the
 * solo home page (see circumstantial.ts's CONTEXT_LABELS/CONTEXT_ICONS),
 * so a returning user recognizes the vocabulary instead of learning a
 * second one just for Movie Night. Each tab is its own <form> posting
 * straight to createMovieNight with a hidden "mode" field -- no client
 * component, no intermediate "which one did I pick" state, tapping a tab
 * IS starting that flavor of night, same one-step-CTA philosophy
 * WatchPartyCard's own doc comment described.
 *
 * Follower avatar stack on the right is real social proof, not
 * decoration for its own sake -- only rendered once there are at least 3
 * followers to show (getRecentFollowers), so a fresh account with one or
 * two follows never sees a stack that reads as sparse/empty. Capped at 3
 * visible faces plus a "+N" count rather than fetching/rendering the
 * whole list -- this bar isn't a followers page.
 */
export async function MovieNightBar({ userId, mediaType }: { userId: string; mediaType: MediaType }) {
  const label = movieNightLabel(mediaType);
  const followers = await getRecentFollowers(userId, 6);
  const visibleFollowers = followers.slice(0, 3);
  const extraCount = followers.length - visibleFollowers.length;
  const showFollowers = followers.length >= 3;

  return (
    <div className="bento-card flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-accent"
          aria-hidden="true"
        >
          <Clapperboard className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium text-foreground">Start a {label}</p>
          <p className="mt-0.5 truncate text-[11px] text-foreground-muted">Blend taste with friends, decide together</p>
        </div>
        {showFollowers && (
          <div className="flex shrink-0 items-center" aria-hidden="true">
            <div className="flex -space-x-2.5">
              {visibleFollowers.map((f) => (
                <Avatar
                  key={f.id}
                  name={f.displayName ?? f.username}
                  src={f.avatarUrl}
                  size={26}
                  className="ring-2 ring-[var(--surface)]"
                />
              ))}
            </div>
            {extraCount > 0 && <span className="ml-1.5 text-[10.5px] font-medium text-foreground-muted">+{extraCount}</span>}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <form action={createMovieNight} className="flex-1">
          <input type="hidden" name="mode" value="date_night" />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-full)] border border-border-strong bg-white/[0.04] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground transition-colors hover:border-accent/50"
          >
            <Heart size={12} className="text-accent" aria-hidden="true" />
            Date night
          </button>
        </form>
        <form action={createMovieNight} className="flex-1">
          <input type="hidden" name="mode" value="with_friends" />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-full)] border border-border-strong bg-white/[0.04] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-foreground transition-colors hover:border-accent/50"
          >
            <Users size={12} className="text-accent" aria-hidden="true" />
            With friends
          </button>
        </form>
      </div>
    </div>
  );
}
