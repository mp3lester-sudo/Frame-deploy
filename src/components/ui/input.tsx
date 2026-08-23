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
        // text-base (16px) on mobile, text-sm (14px) from sm: up -- iOS
        // Safari/WKWebView force-zooms the whole viewport when a focused
        // input's font-size is under 16px, and nothing in this app's
        // viewport meta disables that (nor should it -- disabling
        // pinch-zoom entirely is its own accessibility problem). 16px is
        // the one value that sidesteps the zoom without changing
        // anything about how the field looks once focus lands; sm:
        // reverts to the original 14px on anything wide enough to
        // plausibly not be a phone.
        "h-10 w-full rounded-[var(--radius-md)] border border-glass-border bg-glass px-3 text-base sm:text-sm text-foreground backdrop-blur-sm",
        "placeholder:text-foreground-muted",
        "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
