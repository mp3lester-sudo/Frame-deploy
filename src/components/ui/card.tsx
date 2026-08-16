import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Modernization pass: shared surface for every <Card> consumer
        // now uses the frosted-glass treatment introduced for the home
        // page's bento cards, instead of the flat --surface/--border
        // fill. Rolling it out here (rather than touching each call
        // site) is the deliberate lever for making the change stick
        // app-wide with one edit.
        //
        // p-4 here is the "labeled content panel" tier of the bento-card
        // padding convention documented above .bento-card in globals.css
        // -- override with className if a given card is actually a
        // compact list row (p-3) or a page-level hero (p-5/p-6) instead.
        "bento-card p-4",
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
