"use client";

import { useState, useTransition } from "react";
import { importLetterboxdPaste } from "@/lib/actions/import";
import type { ImportSummary } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";

export function LetterboxdPasteImport() {
  const [html, setHtml] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);

    startTransition(async () => {
      try {
        const result = await importLetterboxdPaste(html);
        setSummary(result);
        setHtml("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-foreground-muted">Import via page paste (free accounts)</p>
      <ol className="mb-3 list-decimal space-y-1 pl-4 text-sm text-foreground-muted">
        <li>
          Open your Diary page on Letterboxd (signed in), e.g.{" "}
          <code className="text-foreground">letterboxd.com/your-username/diary/</code>
        </li>
        <li>Right-click anywhere on the page and choose &quot;View Page Source&quot; (or press Ctrl+U / Cmd+Option+U)</li>
        <li>Select all (Ctrl/Cmd+A), copy (Ctrl/Cmd+C), then paste it into the box below</li>
        <li>
          Diary pages show ~50 films per page — if you have more, click &quot;Older&quot; at the bottom, and repeat for
          each page. It&apos;s safe to import the same page twice.
        </li>
      </ol>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder="Paste your Diary page's source here..."
          rows={6}
          className="w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface-raised p-2 text-xs text-foreground-muted placeholder:text-foreground-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div>
          <Button type="submit" size="sm" variant="secondary" isLoading={isPending} disabled={!html.trim()}>
            Import
          </Button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {summary && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 text-sm">
          <p>
            Imported <span className="text-accent">{summary.matched}</span> of {summary.totalRows} films from this
            page — {summary.rated} rated, {summary.watchedOnly} watched with no rating.
          </p>
          {summary.unmatchedSample.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-foreground-muted">
                {summary.totalRows - summary.matched} not found in Frame&apos;s catalogue yet
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
