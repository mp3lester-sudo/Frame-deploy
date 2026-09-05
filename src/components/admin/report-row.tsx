"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveReport, deleteReportedContent } from "@/lib/actions/admin";
import type { ReportableContentType } from "@/lib/moderation/validate";

type ReportForRow = {
  id: string;
  content_type: ReportableContentType;
  content_id: string;
  note: string | null;
  status: "open" | "reviewed" | "dismissed";
};

type ReporterLite = { id: string; username: string; display_name: string | null } | null;

export function ReportRow({
  report,
  reporter,
  preview,
  reasonLabel,
  timeAgo,
  targetUserId,
  readOnly = false,
}: {
  report: ReportForRow;
  reporter: ReporterLite;
  preview: string | null;
  reasonLabel: string;
  timeAgo: string;
  targetUserId: string | null;
  readOnly?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(report.status);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resolve(next: "reviewed" | "dismissed") {
    startTransition(async () => {
      await resolveReport(report.id, next);
      setStatus(next);
    });
  }

  function handleDeleteContent() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteReportedContent(report.id, report.content_type, report.content_id, deleteReason);
        setDeleted(true);
        setStatus("reviewed");
        setConfirmingDelete(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete content.");
      }
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-foreground-muted">
            {reasonLabel} &middot; {report.content_type.replace("_", " ")} &middot; {timeAgo}
          </p>
          <p className="mt-1 text-sm">
            {deleted ? (
              <span className="italic text-foreground-muted">Content deleted.</span>
            ) : (
              (preview ?? <span className="italic text-foreground-muted">Content no longer exists.</span>)
            )}
          </p>
          {report.note && <p className="mt-1 text-sm text-foreground-muted">Note: &ldquo;{report.note}&rdquo;</p>}
          <p className="mt-2 text-xs text-foreground-muted">
            Reported by{" "}
            {reporter ? (
              <Link href={`/profile/${reporter.username}`} className="hover:text-accent">
                @{reporter.username}
              </Link>
            ) : (
              "a deleted account"
            )}
            {targetUserId && (
              <>
                {" "}
                &middot;{" "}
                <Link href={`/admin/users/${targetUserId}`} className="hover:text-accent">
                  View account
                </Link>
              </>
            )}
          </p>
        </div>

        {!readOnly && (
          <div className="flex shrink-0 gap-2">
            {status === "open" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isPending}
                  onClick={() => resolve("reviewed")}
                  className="uppercase tracking-wider"
                >
                  Mark reviewed
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isPending}
                  onClick={() => resolve("dismissed")}
                  className="uppercase tracking-wider"
                >
                  Dismiss
                </Button>
                {report.content_type !== "profile" && !deleted && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setConfirmingDelete((v) => !v)}
                    className="uppercase tracking-wider"
                  >
                    Delete content
                  </Button>
                )}
              </>
            ) : (
              <span className="text-xs uppercase tracking-wider text-foreground-muted">{status}</span>
            )}
          </div>
        )}
      </div>

      {confirmingDelete && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Input
            type="text"
            placeholder="Reason (shown in the admin action log)"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            className="max-w-xs"
          />
          <Button type="button" variant="danger" size="sm" disabled={isPending} onClick={handleDeleteContent}>
            Confirm delete
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
