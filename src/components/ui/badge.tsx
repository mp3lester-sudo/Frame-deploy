import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        // Modernization pass: glass surface tokens instead of the flat
        // --surface-raised/--border fill, matching Card/Input.
        "inline-flex items-center rounded-[var(--radius-full)] border border-glass-border bg-glass px-2.5 py-0.5 text-xs font-medium text-foreground-muted backdrop-blur-sm",
        className
      )}
      {...props}
    />
  );
}
