import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGamePassBoard } from "@/lib/game-pass/board";
import { boardBounds, buildPathPoints, computeBoardLayout } from "@/lib/game-pass/board-layout";
import { StarTile } from "@/components/game-pass/star-tile";

const COLUMNS = 6;
const TILE_SPACING = 76;
const PADDING = 50;

export default async function GamePassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/game-pass");

  const board = await getGamePassBoard(user.id);
  const watchedCount = board.days.filter((d) => d.status === "watched").length;

  const positions = computeBoardLayout(board.days.length, COLUMNS, TILE_SPACING);
  const { width, height } = boardBounds(positions, PADDING);
  const points = buildPathPoints(positions.map((p) => ({ x: p.x + PADDING, y: p.y + PADDING })));

  // The trophy sits one tile-step past the last star, continuing whichever
  // direction that row was headed.
  const last = positions[positions.length - 1];
  const secondToLast = positions[positions.length - 2] ?? last;
  const trophyDirection = last && secondToLast ? Math.sign(last.x - secondToLast.x) || 1 : 1;
  const trophyPos = last ? { x: last.x + TILE_SPACING * trophyDirection, y: last.y } : { x: 0, y: 0 };
  const trophyWidth = last ? Math.max(width, trophyPos.x + PADDING * 2) : width;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-foreground-muted">Game Pass</span>
        <Link href="/" className="text-[11px] uppercase tracking-wider text-foreground-muted hover:text-accent">
          Home
        </Link>
      </div>
      <h1 className="font-hollywood text-3xl uppercase tracking-[0.08em] text-accent">{board.season.theme_name}</h1>
      <p className="mt-2 text-sm text-foreground-muted">{board.season.theme_description}</p>
      <p className="mt-3 text-xs uppercase tracking-wider text-foreground-muted">
        {watchedCount} of {board.days.length} watched this month
      </p>

      {board.completed && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-accent/50 bg-surface px-4 py-3 text-sm text-accent">
          Season complete — you walked the whole boulevard.
          {!board.rewardGranted && " Your reward is being finalized."}
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-[var(--radius-lg)] border border-border bg-surface py-6">
        <svg
          width={trophyWidth}
          height={height}
          viewBox={`0 0 ${trophyWidth} ${height}`}
          className="mx-auto"
          role="img"
          aria-label={`${board.season.theme_name} Game Pass board, ${watchedCount} of ${board.days.length} days watched`}
        >
          <polyline
            points={points}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="2 8"
            strokeLinecap="round"
            opacity={0.5}
            transform={`translate(0 0)`}
          />
          {last && (
            <line
              x1={last.x + PADDING}
              y1={last.y + PADDING}
              x2={trophyPos.x + PADDING}
              y2={trophyPos.y + PADDING}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="2 8"
              strokeLinecap="round"
              opacity={0.5}
            />
          )}

          {board.days.map((day, i) => (
            <StarTile
              key={day.dayNumber}
              x={positions[i].x + PADDING}
              y={positions[i].y + PADDING}
              dayNumber={day.dayNumber}
              titleId={day.title.id}
              titleName={day.title.name}
              posterUrl={day.title.poster_url}
              status={day.status}
            />
          ))}

          {/* Trophy tile — the season's reward, past the last star. */}
          <g transform={`translate(${trophyPos.x + PADDING} ${trophyPos.y + PADDING})`}>
            <circle
              r={26}
              fill={board.completed ? "var(--accent)" : "var(--surface-raised)"}
              stroke="var(--accent)"
              strokeWidth={2}
              opacity={board.completed ? 1 : 0.5}
            />
            <path
              d="M-10,-8 L-10,-1 A10,10 0 0 0 10,-1 L10,-8 M-13,-8 L13,-8 M-6,-8 A6,7 0 0 0 6,-8 M-2,4 L2,4 L2,8 L6,8 L6,10 L-6,10 L-6,8 L-2,8 Z"
              stroke={board.completed ? "var(--accent-foreground)" : "var(--foreground-muted)"}
              strokeWidth={1.4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>

      <p className="mt-4 text-center text-xs text-foreground-muted">
        Each star reveals on its day. Watch or rate a title to check it off — finish the boulevard by the end of the
        month.
      </p>
    </div>
  );
}
