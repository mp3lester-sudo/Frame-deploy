"use client";

/**
 * Client-only lazy wrapper around LiveCandidateVoting. That component
 * pulls in a Supabase Realtime subscription plus the full voting UI, but
 * page.tsx only ever renders it while a movie night is still in the
 * "collecting" state -- for a decided or cancelled night (the more common
 * state once a night has actually happened) that whole bundle was still
 * being shipped and parsed on page load even though nothing in it ever
 * rendered. `ssr: false` on next/dynamic isn't allowed inside a Server
 * Component, hence this one-purpose client wrapper: page.tsx imports this
 * instead of LiveCandidateVoting directly, so the real component only
 * loads (and only ends up in a separate chunk) when a "collecting" night
 * actually needs it.
 */
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { LiveCandidateVoting } from "./live-candidate-voting";

const LazyLiveCandidateVoting = dynamic(
  () => import("./live-candidate-voting").then((m) => m.LiveCandidateVoting),
  { ssr: false }
);

export function LiveCandidateVotingLazy(props: ComponentProps<typeof LiveCandidateVoting>) {
  return <LazyLiveCandidateVoting {...props} />;
}
