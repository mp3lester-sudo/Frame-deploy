import Image from "next/image";
import Link from "next/link";
import type { Database } from "@/lib/supabase/types";

type Title = Database["public"]["Tables"]["titles"]["Row"];

export function TitleCard({ title, reason }: { title: Title; reason?: string }) {
  return (
    <Link href={`/movie/${title.id}`} className="group block">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-md)] bg-surface-raised">
        {title.poster_url ? (
          <Image
            src={title.poster_url}
            alt={title.name}
            fill
            sizes="(max-width: 768px) 45vw, 200px"
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-foreground-muted">
            {title.name}
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-medium">{title.name}</p>
      {reason && <p className="line-clamp-2 text-xs text-foreground-muted">{reason}</p>}
    </Link>
  );
}
