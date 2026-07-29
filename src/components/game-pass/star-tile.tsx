import Link from "next/link";
import type { GamePassDayStatus } from "@/lib/game-pass/board";

const OUTER_R = 30;
const INNER_R = 12;
const POSTER_R = INNER_R + 3;

/** Standard alternating outer/inner vertex construction for an n-point
 *  star, centered at the origin — computed once as a module constant
 *  rather than hand-typed coordinates. */
function buildStarPath(outerR: number, innerR: number, points = 5): string {
  const coords: string[] = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + i * step;
    coords.push(`${(r * Math.cos(angle)).toFixed(2)},${(r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${coords.join("L")}Z`;
}

const STAR_PATH = buildStarPath(OUTER_R, INNER_R);

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
  const clipId = `star-clip-${dayNumber}`;

  const fill =
    status === "watched" ? "var(--surface-raised)" : status === "current" ? "var(--surface-raised)" : "var(--surface)";
  const strokeOpacity = status === "locked" ? 0.3 : status === "missed" ? 0.55 : 1;
  const posterOpacity = status === "missed" ? 0.45 : 1;

  const star = (
    <g transform={`translate(${x} ${y})`}>
      {status === "current" && (
        <circle r={OUTER_R + 12} fill="var(--accent)" opacity={0.16} className="animate-pulse" />
      )}
      <path d={STAR_PATH} fill={fill} stroke="var(--accent)" strokeWidth={status === "locked" ? 1 : 1.75} strokeOpacity={strokeOpacity} strokeLinejoin="round" />

      {isRevealed && posterUrl && (
        <>
          <clipPath id={clipId}>
            <circle r={POSTER_R} />
          </clipPath>
          <image
            href={posterUrl}
            x={-POSTER_R}
            y={-POSTER_R}
            width={POSTER_R * 2}
            height={POSTER_R * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
            opacity={posterOpacity}
          />
        </>
      )}

      {status === "watched" && (
        <g transform={`translate(${OUTER_R - 10} ${-(OUTER_R - 10)})`}>
          <circle r={8} fill="var(--success)" />
          <path
            d="M-3.5,0 L-1,3 L4,-3.5"
            stroke="var(--background)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      )}

      <text y={OUTER_R + 15} textAnchor="middle" fontSize={10} fill="var(--foreground-muted)">
        {dayNumber}
      </text>
    </g>
  );

  if (!isRevealed) return star;

  return (
    <Link href={`/movie/${titleId}`} aria-label={titleName}>
      {star}
    </Link>
  );
}
