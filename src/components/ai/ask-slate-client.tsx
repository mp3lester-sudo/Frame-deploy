"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "@/components/ui/fade-image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TitleCard } from "@/components/title-card";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];
type Pick = { title: Title; reason: string };
type YearWindow = { minYear: number; maxYear: number };

// A handful of moody, specific prompts rather than genre names -- these
// exist to demonstrate the "describe the feeling, not the genre" pitch
// above the input, and to give someone a running start if they're
// staring at a blank box. Clicking one fills the input; it doesn't
// auto-submit, so there's still a chance to tweak it first.
const EXAMPLE_PROMPTS = ["Something that feels lonely", "Turn my brain off tonight", "A twist I won't see coming"];

// One round of the exchange -- the request that was actually sent to the
// concierge (which, for a reply, is the original ask plus every prior
// reply folded in -- see buildContextedMessage) and what came back.
interface Exchange {
  sentMessage: string;
  reply: string;
  topPicks: Pick[];
  morePicks: Pick[];
  yearWindow: YearWindow | null;
}

// The concierge (see SYSTEM_PROMPT in lib/ai/concierge.ts) is explicitly
// instructed to ask a short clarifying question instead of guessing when a
// request is ambiguous, rather than force-returning picks that don't fit.
// That already comes back as a message with no picks -- this page just
// didn't have anywhere to route that case before. A reply box is exactly
// what a clarifying question wants: not a fresh top-of-page search, a
// continuation of the same thread.
function needsReply(exchange: Exchange): boolean {
  return exchange.topPicks.length === 0 && exchange.morePicks.length === 0 && exchange.reply.trim().length > 0;
}

// The concierge endpoint is single-shot and stateless -- it has no memory
// of what was asked before. Rather than adding conversation-history plumbing
// to the API, a reply folds the whole thread into one plain-text message:
// still exactly what askConcierge() already accepts, just with enough of
// the prior back-and-forth included that "yeah, something like that but
// funnier" reads as an answer to the concierge's own question instead of a
// non-sequitur.
function buildContextedMessage(history: Exchange[], latestReply: string): string {
  if (history.length === 0) return latestReply;
  const threadSoFar = history
    .map((e) => `I asked: "${e.sentMessage}"\nYou said: "${e.reply}"`)
    .join("\n\n");
  return `${threadSoFar}\n\nMy follow-up: "${latestReply}"`;
}

// "Poster wall" backdrop -- a dense, dimmed grid of the catalogue's own
// posters tiled behind the whole page (see lib/ai/poster-wall.ts for the
// query), with the concierge chrome floating on top in frosted glass
// (.bento-card). Rendered `fixed` rather than `absolute` so the wall
// stays put as the page grows with chat history instead of scrolling
// away after the first screen -- the point is that Ask Slate always
// feels like it's standing in front of the whole catalogue, not just on
// the opening screen.
function PosterWall({ posters }: { posters: string[] }) {
  if (posters.length === 0) return null;
  // Repeat the fetched set so the grid tiles densely enough to fill a
  // tall viewport without gaps, same idea as a wallpaper pattern.
  const tiles = [...posters, ...posters];
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-background">
      <div
        className="grid h-full w-full grid-cols-4 gap-[2px] opacity-[0.32] sm:grid-cols-6 md:grid-cols-8"
        style={{ gridAutoRows: "1fr" }}
      >
        {tiles.map((url, i) => (
          <div key={i} className="relative aspect-[2/3] overflow-hidden">
            <Image src={url} alt="" fill className="object-cover grayscale-[0.25]" sizes="15vw" />
          </div>
        ))}
      </div>
      {/* Vignette: near-opaque at the header/input so text and the ask
          bar stay fully legible, easing to a lighter dim toward the
          bottom so the wall itself still reads as a wall, not just a
          dark screen with a pattern hinted at the edges. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(10,9,8,0.97) 0%, rgba(10,9,8,0.86) 40%, rgba(10,9,8,0.72) 70%, rgba(10,9,8,0.6) 100%)",
        }}
      />
    </div>
  );
}

export function AskSlateClient({ posters }: { posters: string[] }) {
  const [query, setQuery] = useState("");
  const [replyText, setReplyText] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  // Era-matching toggle for "movies like X" requests -- restricts results
  // to within a few years of a named movie's release by default, since
  // that's what "like X" usually means for someone anchoring on an era.
  // Off means year genuinely doesn't matter.
  const [matchEra, setMatchEra] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replyRef = useRef<HTMLInputElement>(null);

  const latest = history[history.length - 1] ?? null;
  const awaitingReply = latest ? needsReply(latest) : false;

  async function ask(sentMessage: string) {
    if (!sentMessage.trim()) return;
    setLoading(true);
    setError(null);
    setUpgradeUrl(null);
    try {
      const res = await fetch("/api/ai/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: sentMessage, matchEra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUpgradeUrl(data.upgradeUrl ?? null);
        throw new Error(data.error ?? "Something went wrong");
      }
      const allTopPicks: Pick[] = data.topPicks ?? [];
      const allRecommendations: Pick[] = data.recommendations ?? [];
      const topIds = new Set(allTopPicks.map((p) => p.title.id));
      setHistory((prev) => [
        ...prev,
        {
          sentMessage,
          reply: data.message ?? "",
          topPicks: allTopPicks,
          morePicks: allRecommendations.filter((p) => !topIds.has(p.title.id)),
          yearWindow: data.yearWindow ?? null,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // A fresh ask from the top box always starts a new thread -- replying
  // is the only path that carries context forward, so someone typing a
  // brand new mood into the main box isn't unexpectedly anchored to
  // whatever they asked five minutes ago.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setHistory([]);
    ask(query);
  }

  function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim()) return;
    const contexted = buildContextedMessage(history, replyText);
    setReplyText("");
    ask(contexted);
  }

  function handleExampleClick(prompt: string) {
    setQuery(prompt);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <PosterWall posters={posters} />

      <section className="relative mx-auto max-w-3xl px-4 py-14 sm:py-20">
        {/* Concierge-desk header -- flattened to match the quieter, solid-
            accent treatment already shipped on Home (task a1b1314): plain
            text-accent instead of the gold-foil gradient/glow, sharper
            corners throughout. Poster-wall pass (task #508) kept this
            typography as-is and let the new backdrop carry the drama
            instead of piling more chrome onto the header itself. */}
        <div className="flex flex-col items-center text-center">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">AI Concierge</span>
          <h1 className="text-gold-foil font-section-heading mt-2 text-4xl">Ask Slate</h1>
          <div className="mt-4 h-px w-24 bg-gradient-to-r from-transparent via-accent-deep to-transparent" />
          <p className="font-section-body mt-4 text-sm text-foreground-muted">
            Describe the feeling, not the genre.
          </p>
        </div>

        {/* Ask bar -- frosted glass (.bento-card) instead of the old flat
            bg-surface panel, so the poster wall shows faintly through it
            rather than the input floating on a plain dark rectangle. */}
        <form
          onSubmit={handleSubmit}
          className="bento-card mt-8 p-2 transition-colors focus-within:border-accent/50"
        >
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What are you in the mood for?"
              className="h-12 border-none bg-transparent text-base focus:ring-0"
            />
            <Button
              type="submit"
              size="lg"
              isLoading={loading}
              className="rounded-[var(--radius-sm)] bg-accent shadow-none hover:bg-accent-soft hover:brightness-100"
            >
              Ask
            </Button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleExampleClick(prompt)}
              className="rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs text-foreground-muted backdrop-blur-sm transition-colors hover:border-accent/50 hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Only relevant when a specific movie is named ("movies like X"), but
            left visible always rather than conditionally rendered -- someone
            typing "movies like Jaws" hasn't submitted yet when they'd want to
            already have this set correctly. */}
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={matchEra}
            onClick={() => setMatchEra((v) => !v)}
            className={`inline-flex h-6 w-11 flex-none items-center rounded-full border border-transparent p-0.5 transition-colors ${
              matchEra ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                matchEra ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-xs text-foreground-muted">Match era</span>
        </div>

        {error && (
          <div className="mt-8 rounded-[var(--radius-sm)] border border-danger/40 bg-danger/10 px-4 py-3">
            <p className="text-sm text-danger">
              {error}
              {upgradeUrl && (
                <>
                  {" "}
                  <Link href={upgradeUrl} className="font-medium text-accent hover:underline">
                    Upgrade to Premium
                  </Link>{" "}
                  for unlimited conversations.
                </>
              )}
            </p>
          </div>
        )}

        {loading && (
          <div className="mt-10">
            <div className="skeleton mx-auto h-4 w-2/3 max-w-md rounded-[var(--radius-sm)]" />
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="skeleton aspect-[2/3] w-full rounded-[var(--radius-sm)]" />
                  <div className="skeleton mt-2 h-3.5 w-4/5 rounded-[var(--radius-sm)]" />
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading &&
          history.map((exchange, i) => (
            <div key={i} className="stagger-card mt-10">
              <div className="bento-card px-6 py-5">
                <p className="font-display border-l-2 border-accent pl-4 text-base italic leading-relaxed text-foreground sm:text-lg">
                  {exchange.reply}
                </p>
                {exchange.yearWindow && (
                  <p className="mt-3 pl-4 text-xs text-foreground-muted">
                    Showing movies from {exchange.yearWindow.minYear}–{exchange.yearWindow.maxYear}.
                  </p>
                )}
              </div>

              {exchange.topPicks.length > 0 && (
                <div className="mt-8">
                  <p className="mb-4 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-foreground-muted">
                    Top picks
                  </p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
                    {exchange.topPicks.map((p, j) => (
                      <TitleCard key={p.title.id} title={p.title} reason={p.reason} index={j} />
                    ))}
                  </div>
                </div>
              )}

              {exchange.morePicks.length > 0 && (
                <div className="mt-8">
                  <p className="mb-4 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-foreground-muted">
                    More suggestions
                  </p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
                    {exchange.morePicks.map((p, j) => (
                      <TitleCard key={p.title.id} title={p.title} reason={p.reason} index={j} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

        {/* Reply box -- only appears once the concierge has actually asked
            something back (see needsReply above), so it never sits there
            as dead chrome under a normal picks response. Deliberately
            smaller and less prominent than the top-of-page ask bar: this
            is a continuation of the thread the message above just opened,
            not a fresh search. */}
        {!loading && awaitingReply && (
          <form onSubmit={handleReplySubmit} className="stagger-card mx-auto mt-4 max-w-md">
            <div className="bento-card flex items-center gap-2 rounded-full px-2 py-1.5 transition-colors focus-within:border-accent/50">
              <Input
                ref={replyRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Reply to Slate..."
                className="h-9 border-none bg-transparent text-sm focus:ring-0"
              />
              <Button
                type="submit"
                size="sm"
                isLoading={loading}
                className="rounded-full bg-accent shadow-none hover:bg-accent-soft hover:brightness-100"
              >
                Reply
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
