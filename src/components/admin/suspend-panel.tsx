"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { suspendUser, unsuspendUser, type SuspendDuration } from "@/lib/actions/admin";

const DURATION_OPTIONS: { value: SuspendDuration; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "permanent", label: "Permanent" },
];

export function SuspendPanel({ userId, isBanned }: { userId: string; isBanned: boolean }) {
  const [duration, setDuration] = useState<SuspendDuration>("7d");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSuspend() {
    setError(null);
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    startTransition(async () => {
      try {
        await suspendUser(userId, duration, reason);
        setReason("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to suspend account.");
      }
    });
  }

  function handleUnsuspend() {
    setError(null);
    startTransition(async () => {
      try {
        await unsuspendUser(userId, reason);
        setReason("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to unsuspend account.");
      }
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm uppercase tracking-wider text-foreground-muted">
        {isBanned ? "Account is suspended" : "Suspend account"}
      </h2>

      <Input
        type="text"
        placeholder="Reason (required to suspend, optional to lift)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mb-3"
      />

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {isBanned ? (
        <Button type="button" variant="secondary" disabled={isPending} onClick={handleUnsuspend}>
          Lift suspension
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value as SuspendDuration)}
            className="h-10 rounded-[var(--radius-md)] border border-glass-border bg-glass px-3 text-sm text-foreground backdrop-blur-sm"
          >
            {DURATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button type="button" variant="danger" disabled={isPending} onClick={handleSuspend}>
            Suspend
          </Button>
        </div>
      )}
    </div>
  );
}
