"use client";

import { useState, useTransition } from "react";
import { importLetterboxdPaste } from "@/lib/actions/import";
import type { ImportSummary } from "@/lib/actions/import";
import { Button } from "@/components/ui/button";
import { LETTERBOXD_DIARY_BOOKMARKLET_SOURCE } from "@/lib/import/bookmarklet-source";

// The bookmarklet's `javascript:` payload is built here (not shipped as a
// pre-built string) so the readable source in bookmarklet-source.ts stays
// the single source of truth. Whitespace (including newlines, kept there
// only for readability) collapses to single spaces — safe because that
// source deliberately has no `//` line comments to swallow.
const BOOKMARKLET_HREF = "javascript:" + LETTERBOXD_DIARY_BOOKMARKLET_SOURCE.replace(/\s+/g, " ").trim();

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// React refuses to ever set a real DOM `href` attribute that starts with
// "javascript:" — it's a deliberate XSS guard (see
// https://github.com/facebook/react/pull/15047) and applies even to a
// value the developer hardcoded, not just user input. Rendering
// `<a href={BOOKMARKLET_HREF}>` silently swaps it for a stub href that just
// throws, so a dragged "bookmark" would drop with a href pointing at that
// stub instead of the real script — a bookmark that looks right but does
// nothing when clicked.
//
// The fix: never put the real payload in the `href` DOM attribute at all.
// Keep href="#" (a plain, unsanitized value) and supply the actual
// bookmarklet text directly on the drag event's DataTransfer instead, in
// every format a browser might read when a link is dropped onto the
// bookmarks bar (uri-list, plain text, and a synthetic anchor's outerHTML).
function handleBookmarkletDragStart(e: React.DragEvent<HTMLAnchorElement>) {
  e.dataTransfer.setData("text/uri-list", BOOKMARKLET_HREF);
  e.dataTransfer.setData("text/plain", BOOKMARKLET_HREF);
  e.dataTransfer.setData("text/html", `<a href="${escapeHtmlAttr(BOOKMARKLET_HREF)}">Import Frame Diary</a>`);
}

export function LetterboxdPasteImport() {
  const [html, setHtml] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  // Dragging is the intended path, but it depends on the browser reading
  // DataTransfer the way we expect, and there's no reliable way to confirm
  // a drag onto the (native, outside-the-page) bookmarks bar actually
  // worked. Clicking is the guaranteed fallback: copy the exact same
  // bookmarklet text, then the member pastes it into a bookmark's URL
  // field themselves instead of relying on drag-and-drop.
  async function handleBookmarkletClick(e: React.MouseEvent) {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(BOOKMARKLET_HREF);
      setCopyStatus("Copied. Right-click your bookmarks bar → Add page (or Add bookmark), name it anything, and paste this as the URL.");
    } catch {
      window.prompt("Copy this, then create a new bookmark and paste it as the URL:", BOOKMARKLET_HREF);
    }
  }

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
      <p className="mb-1 text-[11px] uppercase tracking-wider text-foreground-muted">Import from Letterboxd (free accounts)</p>

      <div className="mb-4 rounded-[var(--radius-md)] border border-accent/30 bg-surface-raised p-3">
        <p className="text-xs uppercase tracking-wider text-accent">Recommended — one click, whole diary</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-foreground-muted">
          <li>
            Drag this to your bookmarks bar (or click it to copy the link instead):{" "}
            <a
              href="#"
              draggable
              onDragStart={handleBookmarkletDragStart}
              onClick={handleBookmarkletClick}
              className="inline-flex cursor-grab items-center rounded-[var(--radius-sm)] bg-accent px-2 py-1 text-xs font-medium text-accent-foreground active:cursor-grabbing"
              title="Drag me to your bookmarks bar, or click to copy the bookmarklet link"
            >
              Import Frame Diary
            </a>
          </li>
          <li>
            Open your own Diary on Letterboxd, signed in — e.g.{" "}
            <code className="text-foreground">letterboxd.com/your-username/films/diary/</code>
          </li>
          <li>Click the bookmark. It pages through your whole diary automatically and copies it to your clipboard.</li>
          <li>Come back here and paste into the box below — one paste covers your entire history.</li>
        </ol>
        <p className="mt-2 text-xs text-foreground-muted">
          Runs entirely in your own signed-in browser tab — it&apos;s the same page-source lookup as the manual method
          below, just automated across every page instead of one at a time.
        </p>
        {copyStatus && <p className="mt-2 text-xs text-accent">{copyStatus}</p>}
      </div>

      <details className="mb-4">
        <summary className="cursor-pointer text-xs uppercase tracking-wider text-foreground-muted">
          Manual method instead (no bookmarklet)
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-foreground-muted">
          <li>
            Open your Diary page on Letterboxd (signed in), e.g.{" "}
            <code className="text-foreground">letterboxd.com/your-username/films/diary/</code>
          </li>
          <li>Right-click anywhere on the page and choose &quot;View Page Source&quot; (or press Ctrl+U / Cmd+Option+U)</li>
          <li>Select all (Ctrl/Cmd+A), copy (Ctrl/Cmd+C), then paste it into the box below</li>
          <li>
            Diary pages show ~50 films per page — if you have more, click &quot;Older&quot; at the bottom, and repeat
            for each page. It&apos;s safe to import the same page twice.
          </li>
        </ol>
      </details>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder="Paste here — either what the bookmarklet copied, or a Diary page's source..."
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
            Imported <span className="text-accent">{summary.matched}</span> of {summary.totalRows} films —{" "}
            {summary.rated} rated, {summary.watchedOnly} watched with no rating.
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
