"use client";

import { cn } from "@/lib/utils";
import type { QuickFilter } from "@/lib/demo/home-demo-data";

export function QuickFilters({
  filters,
  selected,
  onSelect,
}: {
  filters: readonly QuickFilter[];
  selected: QuickFilter | null;
  onSelect: (filter: QuickFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => {
        const active = selected === filter;
        return (
          <button
            key={filter}
            type="button"
            onClick={() => onSelect(filter)}
            className={cn(
              "rounded-[var(--radius-full)] border px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors",
              active
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground"
            )}
          >
            {filter}
          </button>
        );
      })}
    </div>
  );
}
