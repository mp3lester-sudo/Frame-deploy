"use client";

import { useRef, useState, useTransition } from "react";
import { importLetterboxdPaste } from "@/lib/actions/import";
import type { ImportSummary } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";
import { extractDiaryFragmentsFromPages } from "@/lib/import/extract-diary-fragments";

/**
 * Easiest-available path for Letterboxd members without Pro (whose account
 * has no CSV export under Settings -> Data). A bookmarklet that auto-paged
 * through a member's diary used to live here, but it asked people to trust
 * and run a script via a fiddly drag-to-bookmarks-bar interaction — more
 * friction than it saved for most people, and it broke in confusing ways
 * across browsers. This replaces it with something with zero moving parts:
 * "Save Page As" a Diary page (a single, familiar browser shortcut) and
 * drop the saved file(s) here. Multiple files can be dropped/selected at
 * once, so a long diary history still only needs one Import click at the
 * end instead of one per page.
 *
 * Both paths (dropped files and pasted text) run extractDiaryFragments
 * client-side before ever calling importLetterboxdPaste — a saved
 * "Complete Webpage" or a full page-source paste is mostly boilerplate the
 * server-side parser was always going to discard, and sending it raw risks
 * tripping Next's default 1MB Server Action body cap (which fails with an
 * opaque, digest-only error, not a helpful one — see next.config.ts).
 * Shrinking first means only the few-hundred-bytes-per-film fragments the
 * parser actually needs ever leave the browser.
 */
export function LetterboxdPasteImport() {
  const [html, setHtml] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) => /\.html?$/i.test(f.name));
    if (incoming.length === 0) return;
    setFiles((prev) => [...prev, ...incoming]);
    setError(null);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  function runImport(html: string) {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      try {
        const result = await importLetterboxdPaste(html);
        setSummary(result);
        setFiles([]);
        setHtml("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  async function handleImportFiles() {
    if (files.length === 0) return;
    const contents = await Promise.all(files.map((f) => f.text()));
    runImport(extractDiaryFragmentsFromPages(contents));
  }

  function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    runImport(extractDiaryFragmentsFromPages([html]));
  }

  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-foreground-muted">Import from Letterboxd (free accounts)</p>
      <p className="mb-3 text-sm text-foreground-muted">
        Free Letterboxd accounts don&apos;t have the CSV export (that&apos;s Pro-only), so this reads your Diary page
        the way any browser can see it — no login sharing, no extensions.
      </p>

      <div className="mb-4 rounded-[var(--radius-md)] border border-accent/30 bg-surface-raised p-3">
        <ol className="list-decimal space-y-1 pl-4 text-sm text-foreground-muted">
          <li>
            Open your own Diary on Letterboxd, signed in — e.g.{" "}
            <code className="text-foreground">letterboxd.com/your-username/films/diary/</code>
          </li>
          <li>
            Press <code className="text-foreground">Ctrl+S</code> (Windows) or{" "}
            <code className="text-foreground">Cmd+S</code> (Mac) to save the page, then just click Save.
          </li>
          <li>
            Diary pages show ~50 films at a time — if you have more, click &quot;Older&quot; at the bottom, save that
            page too, and repeat. Every saved page can be dropped in at once below.
          </li>
          <li>Drag the saved file(s) into the box below, then click Import.</li>
        </ol>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border-2 border-dashed p-6 text-center transition-colors ${
          isDraggingOver ? "border-accent bg-accent/10" : "border-border hover:border-border-strong"
        }`}
      >
        <p className="text-sm text-foreground-muted">Drop your saved Diary page(s) here, or click to choose files</p>
        <p className="text-xs text-foreground-muted/70">Accepts the .html file(s) from &quot;Save Page As&quot;</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <ul className="flex flex-col gap-1 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-raised px-2 py-1">
                <span className="truncate text-foreground-muted">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-2 shrink-0 text-xs text-foreground-muted hover:text-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div>
            <Button type="button" size="sm" variant="secondary" isLoading={isPending} onClick={handleImportFiles}>
              Import {files.length} file{files.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs uppercase tracking-wider text-foreground-muted">
          Can&apos;t save a file? Paste the page source instead
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-foreground-muted">
          <li>Right-click anywhere on the Diary page and choose &quot;View Page Source&quot; (or press Ctrl+U / Cmd+Option+U)</li>
          <li>Select all (Ctrl/Cmd+A), copy (Ctrl/Cmd+C), then paste it into the box below</li>
          <li>Repeat for each page if you have more than ~50 films — pasting more text just adds to what&apos;s already there</li>
        </ol>
        <form onSubmit={handlePasteSubmit} className="mt-2 flex flex-col gap-3">
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder="Paste Diary page source here..."
            rows={6}
            className="w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface-raised p-2 text-xs text-foreground-muted placeholder:text-foreground-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div>
            <Button type="submit" size="sm" variant="secondary" isLoading={isPending} disabled={!html.trim()}>
              Import pasted text
            </Button>
          </div>
        </form>
      </details>

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
