import type { IndieNewsItem } from "@/lib/news/indie-news";

/** Renders nothing if the live feed pull came back empty (network hiccup,
 *  rate limit) rather than showing an awkward empty card. */
export function DailyNewsCard({ story }: { story: IndieNewsItem | null }) {
  if (!story) return null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Today&apos;s story</p>
      <a
        href={story.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block text-lg font-medium leading-snug text-foreground hover:text-accent hover:underline"
      >
        {story.title}
      </a>
      <p className="mt-2 text-[11px] uppercase tracking-wider text-foreground-muted">{story.source}</p>
    </div>
  );
}
