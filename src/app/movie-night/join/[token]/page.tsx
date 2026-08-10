import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/verified-user";
import { joinMovieNightByToken } from "@/lib/actions/movie-night";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/**
 * The other half of Movie Night's invite loop: this page works for
 * *anyone* with the link, no account required to load it. It shows real
 * content (who's hosting, who's already in) via the movie_night_preview
 * RPC (migration 0037, security definer -- movie_nights itself stays
 * locked to participants), and only requires signing up at the moment of
 * actually voting. That's deliberate: showing nothing behind a login wall
 * gives someone no reason to bother signing up; showing them exactly what
 * they'd be joining does.
 */
export default async function MovieNightJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const viewer = await getVerifiedUser();

  const { data: rows } = await supabase.rpc("movie_night_preview", { p_token: token });
  const preview = rows?.[0];

  if (!preview) {
    return (
      <section className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="font-display text-xl">Invite not found</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          This link isn&apos;t valid, or the movie night it pointed to no longer exists.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-accent hover:underline">
          Go to Backlot
        </Link>
      </section>
    );
  }

  const hostName = preview.host_display_name ?? preview.host_username;
  const stillOpen = preview.status === "collecting";

  return (
    <section className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6 text-center">
      <div className="mb-4 flex justify-center -space-x-3">
        {preview.participant_avatars.length > 0 ? (
          preview.participant_avatars.map((url, i) => (
            <Avatar key={i} name={hostName} src={url} size={48} className="border-2 border-background" />
          ))
        ) : (
          <Avatar name={hostName} src={preview.host_avatar_url} size={48} className="border-2 border-background" />
        )}
      </div>

      <h1 className="font-display text-2xl">
        <Link href={`/profile/${preview.host_username}`} className="hover:text-accent">
          {hostName}
        </Link>{" "}
        wants your pick
      </h1>
      <p className="mt-2 text-sm text-foreground-muted">
        {preview.participant_count} {preview.participant_count === 1 ? "person is" : "people are"} deciding what to
        watch tonight. Join in and vote on something everyone&apos;s taste agrees on.
      </p>

      {!stillOpen ? (
        <p className="mt-8 text-sm text-foreground-muted">
          This movie night already {preview.status === "decided" ? "picked something" : "wrapped up"} -- ask{" "}
          {hostName} to start a new one.
        </p>
      ) : viewer ? (
        <form action={joinMovieNightByToken.bind(null, { token })} className="mt-8">
          <Button type="submit" className="w-full">
            Join movie night
          </Button>
        </form>
      ) : (
        <div className="mt-8 flex flex-col gap-2">
          <Link href={`/signup?mn=${token}`}>
            <Button type="button" className="w-full">
              Sign up to vote
            </Button>
          </Link>
          <Link
            href={`/login?next=/movie-night/join/${token}`}
            className="text-xs text-foreground-muted hover:text-accent"
          >
            Already have an account? Log in
          </Link>
        </div>
      )}
    </section>
  );
}
