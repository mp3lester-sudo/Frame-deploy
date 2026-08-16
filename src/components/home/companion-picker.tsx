"use client";

import { useState, useTransition } from "react";
import { getCompanionBlendRecommendations, type CompanionBlendResult } from "@/lib/actions/companion-recommendations";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HeroRecommendation } from "./hero-recommendation";
import { MoodRow } from "./mood-row";

const LABEL_BY_CONTEXT: Record<"date_night" | "with_friends", string> = {
  date_night: "Who's your date tonight?",
  with_friends: "Who's with you tonight?",
};

const PLACEHOLDER_BY_CONTEXT: Record<"date_night" | "with_friends", string> = {
  date_night: "Their username",
  with_friends: "Add a username",
};

/**
 * "Date night" and "With friends" used to just apply a solo tone/pacing
 * filter to the signed-in user's OWN taste vector -- a real second person's
 * taste never actually entered the picture. This is the fix: pick who
 * you're actually with right now, and get a genuine two-(or more-)person
 * compromise, built on the same strict fairness rule Movie Night uses (see
 * getCandidatesForUserGroup in movie-night.ts) -- a pick never surfaces if
 * it's a clear miss for either of you, even if the average looks great.
 *
 * Deliberately "pick each time" rather than a saved default partner/group --
 * who you're actually watching with on a given night varies, and this
 * avoids needing any new persistent settings just to try it once.
 */
export function CompanionPicker({ context }: { context: "date_night" | "with_friends" }) {
  const [usernames, setUsernames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompanionBlendResult | null>(null);

  function addUsername() {
    const trimmed = draft.trim().replace(/^@/, "");
    if (!trimmed) return;
    setUsernames((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setDraft("");
  }

  function removeUsername(u: string) {
    setUsernames((prev) => prev.filter((x) => x !== u));
    setResult(null); // stale blend once the roster changes -- don't show picks for people no longer in the list
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const r = await getCompanionBlendRecommendations(usernames);
        setResult(r);
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : "Could not blend those tastes");
      }
    });
  }

  if (result) {
    const [hero, ...morePicks] = result.recommendations;
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-foreground-muted">
            Blending your taste with {result.companionNames.join(" and ")}.
          </p>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="shrink-0 text-xs uppercase tracking-wider text-accent hover:underline"
          >
            Change
          </button>
        </div>
        {hero && (
          <div className="mb-8">
            <HeroRecommendation
              title={hero.title}
              reason={hero.reason}
              detail={hero.detail}
              matchPercent={hero.matchPercent}
              director={null}
            />
          </div>
        )}
        {morePicks.length > 0 && <MoodRow picks={morePicks} isColdStart={false} />}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <p className="text-sm font-medium">{LABEL_BY_CONTEXT[context]}</p>
      <p className="mt-1 text-xs text-foreground-muted">
        Add their Slate username(s) and we&apos;ll find a genuine compromise — never a pick that&apos;s a clear
        miss for either of you.
      </p>

      <form onSubmit={handleSubmit} className="mt-4">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUsername();
              }
            }}
            placeholder={PLACEHOLDER_BY_CONTEXT[context]}
            disabled={isPending}
          />
          <Button type="button" variant="secondary" onClick={addUsername} disabled={isPending}>
            Add
          </Button>
        </div>

        {usernames.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {usernames.map((u) => (
              <span
                key={u}
                className="flex items-center gap-1.5 rounded-[var(--radius-full)] bg-background px-3 py-1 text-xs text-foreground-muted"
              >
                @{u}
                <button
                  type="button"
                  onClick={() => removeUsername(u)}
                  aria-label={`Remove ${u}`}
                  className="text-foreground-muted hover:text-foreground"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <Button type="submit" className="mt-4" disabled={usernames.length === 0} isLoading={isPending}>
          Get our picks
        </Button>
      </form>
    </div>
  );
}
