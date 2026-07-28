import Link from "next/link";
import type { movieNight as MovieNightType } from "@/lib/demo/home-demo-data";

export function MovieNightCard({ data }: { data: typeof MovieNightType }) {
  return (
    <div>
      <h3 className="font-display mb-3 text-lg">Movie night</h3>
      <Link
        href="/movie-night"
        className="flex items-center gap-4 rounded-[var(--radius-md)] border border-border bg-surface p-4 transition-colors hover:border-border-strong"
      >
        <div className="flex -space-x-2">
          {data.participants.map((p) => (
            <div
              key={p.initial}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-accent/40 bg-surface-raised text-xs font-medium text-accent"
              title={p.name}
            >
              {p.initial}
            </div>
          ))}
        </div>
        <div className="flex-1">
          <p className="text-sm">{data.copy}</p>
          <p className="text-[11px] uppercase tracking-wider text-accent">{data.status}</p>
        </div>
      </Link>
    </div>
  );
}
