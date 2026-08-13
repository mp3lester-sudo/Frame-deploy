import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // Modernization pass: glass surface tokens instead of the flat
        // --surface/--border fill, matching the Card/Badge update -- kept
        // at the original --radius-md (not the bigger bento --radius-xl)
        // since a 20px radius reads oddly on a single-line text field.
        "h-10 w-full rounded-[var(--radius-md)] border border-glass-border bg-glass px-3 text-sm text-foreground backdrop-blur-sm",
        "placeholder:text-foreground-muted",
        "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
