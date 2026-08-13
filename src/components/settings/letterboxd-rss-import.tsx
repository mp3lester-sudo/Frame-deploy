"use client";

import { useState, useTransition } from "react";
import { importLetterboxdRss } from "@/lib/actions/import";
import type { ImportSummary } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The fastest of the three import paths -- just a username, no file
 * wrangling at all. Trades completeness for speed: Letterboxd's RSS feed
 * only carries a member's ~50-76 most recent diary/review entries with no
 * pagination, so this is positioned as the lead/quick option, with the
 * paste-HTML and CSV methods below it still there for a full-history
 * backfill. See lib/actions/import.ts (importLetterboxdRss) for why RSS is
 * viable server-side when the Diary/Films HTML pages aren't (Cloudflare).
 */
export function LetterboxdRssImport() {
  const [username, setUsername] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const result = await importLetterboxdRss(username);
      if (result.ok) {
        setSummary(result.summary);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-accent-soft">Quick import</p>
      <p className="mb-3 text-sm text-foreground-muted">
        Just your username -- pulls your ~75 most recent diary entries in seconds. For your full history, use CSV or
        paste import below instead.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your-letterboxd-username"
          className="flex-1"
        />
        <Button type="submit" size="sm" isLoading={isPending} disabled={!username.trim()}>
          Import
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {summary && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 text-sm">
          <p>
            Imported <span className="text-accent">{summary.matched}</span> of {summary.totalRows} films --{" "}
            {summary.rated} rated, {summary.watchedOnly} watched with no rating.
          </p>
          {summary.unmatchedSample.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-foreground-muted">
                {summary.totalRows - summary.matched} not found in Backlot&apos;s catalogue yet
              </summary>
              <ul className="mt-2 flex flex-col gap-0.5 text-xs text-foreground-muted">
                {summary.unmatchedSample.map((u, i) => (
                  <li key={i}>
                    {u.name}
                    {u.year ? ` (${u.year})` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
