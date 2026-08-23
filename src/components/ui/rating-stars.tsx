"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Half-star rating input/display, 0-5 in 0.5 increments — Letterboxd-style.
 * Pass onChange to make it interactive; omit it for a read-only display.
 */
export function RatingStars({
  value,
  onChange,
  size = 20,
  className,
}: {
  value: number;
  onChange?: (score: number) => void;
  size?: number;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;
  const interactive = !!onChange;

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }).map((_, i) => {
        const full = i + 1 <= display;
        const half = !full && i + 0.5 <= display;

        return (
          <div
            key={i}
            className={cn("relative", interactive && "cursor-pointer")}
            style={{ width: size, height: size }}
            onMouseLeave={() => interactive && setHover(null)}
          >
            <Star
              width={size}
              height={size}
              className="absolute inset-0 text-foreground-muted transition-colors duration-150"
              strokeWidth={1.5}
            />
            {(full || half) && (
              <div
                className="absolute inset-0 overflow-hidden transition-transform duration-150 ease-out"
                style={{
                  width: half ? "50%" : "100%",
                  transform: interactive && hover != null ? "scale(1.12)" : "scale(1)",
                }}
              >
                <Star
                  width={size}
                  height={size}
                  className="text-accent fill-accent drop-shadow-[0_0_5px_rgba(205,166,70,0.55)]"
                  strokeWidth={1.5}
                />
              </div>
            )}
            {interactive && (
              <>
                <button
                  type="button"
                  aria-label={`Rate ${i + 0.5}`}
                  className="absolute left-0 w-1/2"
                  style={{ top: -6, bottom: -6 }}
                  onMouseEnter={() => setHover(i + 0.5)}
                  onClick={() => onChange!(i + 0.5)}
                />
                <button
                  type="button"
                  aria-label={`Rate ${i + 1}`}
                  className="absolute right-0 w-1/2"
                  style={{ top: -6, bottom: -6 }}
                  onMouseEnter={() => setHover(i + 1)}
                  onClick={() => onChange!(i + 1)}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
