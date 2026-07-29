import Link from "next/link";
import type { GamePassDayStatus } from "@/lib/game-pass/board";

// Each day is a framed movie poster propped along the boulevard — a real
// 2:3 poster crop (not squeezed into a star silhouette), with a gold day
// medallion at the top-left corner (echoing a Walk of Fame star plaque)
// and a status medallion at the top-right. Locked days stay a mystery:
// no poster, no title, just the day number.
const POSTER_W = 88;
const POSTER_H = 132;
const CHIP_R = 15;

/** Truncate a title to fit the caption line under the poster — SVG <text>
 *  has no CSS text-overflow, so this is done by hand. */
function truncateTitle(name: string, maxChars = 16): string {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, maxChars - 1).trimEnd()}…`;
}

export function StarTile({
  x,
  y,
  dayNumber,
  titleId,
  titleName,
  posterUrl,
  status,
}: {
  x: number;
  y: number;
  dayNumber: number;
  titleId: string;
  titleName: string;
  posterUrl: string | null;
  status: GamePassDayStatus;
}) {
  const isRevealed = status === "watched" || status === "current" || status === "missed";
  const clipId = `poster-clip-${dayNumber}`;
  const cardX = -POSTER_W / 2;
  const cardY = -POSTER_H / 2;
  const captionY = POSTER_H / 2 + 20;

  const frameOpacity = status === "locked" ? 0.4 : status === "missed" ? 0.65 : 1;
  const posterOpacity = status === "missed" ? 0.55 : 1;

  const tile = (
    <g transform={`translate(${x} ${y})`}>
      {status === "current" && (
        <circle r={POSTER_H / 2 + 22} fill="var(--accent)" opacity={0.14} className="animate-pulse" />
      )}

      {/* The poster card itself, framed like a boulevard display board. */}
      <rect
        x={cardX - 3}
        y={cardY - 3}
        width={POSTER_W + 6}
        height={POSTER_H + 6}
        rx={9}
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth={status === "locked" ? 1 : 2}
        strokeDasharray={status === "locked" ? "4 5" : undefined}
        strokeOpacity={frameOpacity}
      />

      {isRevealed && posterUrl ? (
        <>
          <clipPath id={clipId}>
            <rect x={cardX} y={cardY} width={POSTER_W} height={POSTER_H} rx={6} />
          </clipPath>
          <image
            href={posterUrl}
            x={cardX}
            y={cardY}
            width={POSTER_W}
            height={POSTER_H}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
            opacity={posterOpacity}
          />
        </>
      ) : (
        <text x={0} y={8} textAnchor="middle" fontSize={30} fill="var(--foreground-muted)" opacity={0.35}>
          ?
        </text>
      )}

      {/* Day medallion — always visible, dimmer while locked. */}
      <g transform={`translate(${cardX} ${cardY})`}>
        <circle r={CHIP_R} fill="var(--accent)" stroke="var(--background)" strokeWidth={2.5} opacity={status === "locked" ? 0.45 : 1} />
        <text y={4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--accent-foreground)">
          {dayNumber}
        </text>
      </g>

      {/* Status medallion — only once the day is revealed. */}
      {isRevealed && (
        <g transform={`translate(${-cardX} ${cardY})`}>
          <circle
            r={CHIP_R}
            fill={status === "watched" ? "var(--success)" : status === "current" ? "var(--surface-raised)" : "var(--surface)"}
            stroke={status === "missed" ? "var(--danger)" : "var(--accent)"}
            strokeWidth={2}
            strokeOpacity={status === "missed" ? 0.6 : 1}
          />
          {status === "watched" && (
            <path
              d="M-6,0 L-1.5,5 L6.5,-6"
              stroke="var(--background)"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
          {status === "current" && <circle r={5} fill="var(--accent)" />}
          {status === "missed" && (
            <path
              d="M-4,-4 L4,4 M4,-4 L-4,4"
              stroke="var(--danger)"
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.75}
            />
          )}
        </g>
      )}

      <text y={captionY} textAnchor="middle" fontSize={11} fill={isRevealed ? "var(--foreground)" : "var(--foreground-muted)"} className="font-display">
        {isRevealed ? truncateTitle(titleName) : `Day ${dayNumber}`}
      </text>
    </g>
  );

  if (!isRevealed) return tile;

  return (
    <Link href={`/movie/${titleId}`} aria-label={titleName}>
      {tile}
    </Link>
  );
}
