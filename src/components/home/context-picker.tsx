import Link from "next/link";
import { CIRCUMSTANTIAL_CONTEXTS, CONTEXT_LABELS, type CircumstantialContext } from "@/lib/context/circumstantial";

/**
 * Plain server-rendered links (?context=...) rather than a client component
 * with its own fetch — consistent with the rest of the app (everything here
 * is RSC + server actions, no client-side data fetching pattern exists yet),
 * and it means picking a context is just a normal navigation, no extra JS.
 */
export function ContextPicker({ active }: { active: CircumstantialContext }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CIRCUMSTANTIAL_CONTEXTS.map((context) => {
        const isActive = context === active;
        return (
          <Link
            key={context}
            href={context === "solo" ? "/" : `/?context=${context}`}
            className={
              isActive
                ? "rounded-[var(--radius-full)] bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
                : "rounded-[var(--radius-full)] border border-border px-3 py-1.5 text-xs text-foreground-muted hover:border-border-strong hover:text-foreground"
            }
          >
            {CONTEXT_LABELS[context]}
          </Link>
        );
      })}
    </div>
  );
}
