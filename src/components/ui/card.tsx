import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // --radius-md, not -lg: this used to be the only place in the app
        // using the "lg" token while ~40 other hand-rolled card divs
        // elsewhere all used "md" -- md is the actual established
        // convention, so this was the odd one out, not the standard.
        "rounded-[var(--radius-md)] border border-border bg-surface p-4",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex items-center justify-between", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />;
}
