"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { resolveReport } from "@/lib/actions/admin";
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
  readOnly = false,
}: {
  report: ReportForRow;
  reporter: ReporterLite;
  preview: string | null;
  reasonLabel: string;
  timeAgo: string;
  readOnly?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(report.status);

  function resolve(next: "reviewed" | "dismissed") {
    startTransition(async () => {
      await resolveReport(report.id, next);
      setStatus(next);
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
            {preview ?? <span className="italic text-foreground-muted">Content no longer exists.</span>}
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
              </>
            ) : (
              <span className="text-xs uppercase tracking-wider text-foreground-muted">{status}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
