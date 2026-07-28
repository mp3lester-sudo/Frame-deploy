"use client";

import { Sparkles } from "lucide-react";

export function TasteSearchBar({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-3 transition-colors focus-within:border-accent/50"
    >
      <Sparkles size={16} className="shrink-0 text-foreground-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What are you in the mood for?"
        className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus:outline-none"
      />
    </form>
  );
}
