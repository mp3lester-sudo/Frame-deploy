"use client";

import { useState, useTransition } from "react";
import { reportContent } from "@/lib/actions/moderation";
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportableContentType } from "@/lib/moderation/validate";

/**
 * Small inline "Report" affordance -- a text link that expands into a
 * reason picker + optional note, rather than a modal, matching the
 * lightweight "Delete this review?" inline-confirm pattern already used
 * by DeleteReviewButton for a similarly low-frequency action. Works for
 * any reportable content type (review, comment, message, club post,
 * profile) since the shape of a report is identical regardless.
 */
export function ReportButton({ contentType, contentId }: { contentType: ReportableContentType; contentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (submitted) {
    return <span className="text-xs text-foreground-muted">Reported</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-foreground-muted hover:text-danger"
      >
        Report
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Pick a reason for this report");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await reportContent(contentType, contentId, reason, note);
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't submit that report");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-1 flex flex-col gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-xs"
    >
      <label className="flex flex-col gap-1">
        <span className="text-foreground-muted">Reason</span>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-[var(--radius-sm)] border border-border bg-surface-raised px-2 py-1 text-xs"
        >
          <option value="">Choose one…</option>
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REPORT_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        className="rounded-[var(--radius-sm)] border border-border bg-surface-raised px-2 py-1 text-xs placeholder:text-foreground-muted/60"
      />
      {error && <p className="text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-foreground-muted hover:text-foreground">
          Cancel
        </button>
        <button type="submit" disabled={isPending} className="font-medium text-danger hover:underline disabled:opacity-50">
          {isPending ? "Submitting…" : "Submit report"}
        </button>
      </div>
    </form>
  );
}
