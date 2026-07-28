import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-sm text-foreground",
        "placeholder:text-foreground-muted",
        "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
