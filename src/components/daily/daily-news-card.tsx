import type { DailyNewsStory } from "@/lib/news/daily-story";
import { ArticleThumbnail } from "./article-thumbnail";

/** Renders nothing if the live feed pull came back empty (network hiccup,
 *  rate limit) rather than showing an awkward empty card. */
export function DailyNewsCard({ story }: { story: DailyNewsStory | null }) {
  if (!story) return null;

  return (
    <a
      href={story.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface transition-colors hover:border-border-strong"
    >
      {story.imageUrl && (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-raised">
          <ArticleThumbnail src={story.imageUrl} alt="" />
        </div>
      )}
      <div className="p-5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Today&apos;s story</p>
        <p className="mt-2 text-lg font-medium leading-snug text-foreground group-hover:text-accent group-hover:underline">
          {story.title}
        </p>
        <p className="mt-2 text-[11px] uppercase tracking-wider text-foreground-muted">{story.source}</p>
      </div>
    </a>
  );
}
