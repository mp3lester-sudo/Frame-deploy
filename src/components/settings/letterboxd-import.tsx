"use client";

import { useRef, useState, useTransition } from "react";
import { importLetterboxdData, type ImportSummary } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";

export function LetterboxdImport() {
  const ratingsRef = useRef<HTMLInputElement>(null);
  const watchedRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);

    const ratingsFile = ratingsRef.current?.files?.[0];
    const watchedFile = watchedRef.current?.files?.[0];
    if (!ratingsFile && !watchedFile) {
      setError("Choose at least one file — ratings.csv or watched.csv.");
      return;
    }

    const formData = new FormData();
    if (ratingsFile) formData.set("ratingsFile", ratingsFile);
    if (watchedFile) formData.set("watchedFile", watchedFile);

    startTransition(async () => {
      try {
        const result = await importLetterboxdData(formData);
        setSummary(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-foreground-muted">Import via CSV (Letterboxd Pro)</p>
      <p className="mb-3 text-sm text-foreground-muted">
        This requires a Letterboxd Pro account — the CSV export lives at Settings &rarr; Data on letterboxd.com, and
        free accounts don&apos;t have that tab. If that&apos;s you, use the paste-based import below instead. Pro
        members: download your export bundle there, unzip it, and upload{" "}
        <code className="text-foreground">ratings.csv</code> and/or <code className="text-foreground">watched.csv</code>{" "}
        below. Films are matched by title and year — anything not yet in Backlot&apos;s catalogue will show up as
        unmatched rather than being guessed at.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-foreground-muted">ratings.csv</label>
          <input
            ref={ratingsRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:brightness-110"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-foreground-muted">watched.csv (optional)</label>
          <input
            ref={watchedRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:brightness-110"
          />
        </div>

        <div>
          <Button type="submit" size="sm" variant="secondary" isLoading={isPending}>
            Import
          </Button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {summary && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-raised p-3 text-sm">
          <p>
            Imported <span className="text-accent">{summary.matched}</span> of {summary.totalRows} films —{" "}
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
