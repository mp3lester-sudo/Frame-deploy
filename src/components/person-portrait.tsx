import Image from "@/components/ui/fade-image";
import { cn } from "@/lib/utils";

/**
 * Full-size portrait for the person profile page hero — same initials-
 * fallback idea as the circular <Avatar>, but a portrait rectangle rather
 * than a circle, and expects an already-upsized image URL (see
 * tmdbImageAtSize) rather than the small w185 thumbnail used in cast rows.
 */
export function PersonPortrait({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  if (src) {
    return (
      <div className={cn("relative aspect-[2/3] overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised", className)}>
        <Image src={src} alt={name} fill sizes="(min-width: 640px) 224px, 160px" className="object-cover" />
      </div>
    );
  }

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-[var(--radius-lg)] bg-surface-raised",
        className
      )}
    >
      <span className="text-4xl font-medium text-foreground-muted">{initials}</span>
    </div>
  );
}
