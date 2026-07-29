import Link from "next/link";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getGamePassBoard } from "@/lib/game-pass/board";
import { boardBounds, buildSmoothPath, computeSwervyPath } from "@/lib/game-pass/board-layout";
import { StarTile } from "@/components/game-pass/star-tile";
import { HollywoodSignBanner, PalmTree, TheaterMarker } from "@/components/game-pass/monuments";

// A single winding lane down the page — the Game of Life convention —
// rather than a grid of rows/columns. Vertical spacing has to clear the
// tallest a poster tile ever gets; amplitude/wavelength control how wide
// and how often the path swerves.
const VERTICAL_SPACING = 190;
const AMPLITUDE = 115;
const WAVELENGTH_DAYS = 6;
const PADDING = 70;
const SIDE_PADDING = PADDING + 65; // extra room for palm trees past the swerve
const BANNER_HEIGHT = 130;
const TOP_OFFSET = PADDING + BANNER_HEIGHT;
const BOTTOM_EXTRA = 110; // room for the theater marker + trophy past the last day

export default async function GamePassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/game-pass");

  const board = await getGamePassBoard(user.id);
  const watchedCount = board.days.filter((d) => d.status === "watched").length;

  const positions = computeSwervyPath(board.days.length, VERTICAL_SPACING, AMPLITUDE, WAVELENGTH_DAYS);
  const { width: coreWidth, height: coreHeight } = boardBounds(positions, 0);
  const boardWidth = coreWidth + SIDE_PADDING * 2;
  const boardHeight = TOP_OFFSET + coreHeight + BOTTOM_EXTRA;

  const renderX = (x: number) => x + SIDE_PADDING;
  const renderY = (y: number) => y + TOP_OFFSET;

  const last = positions[positions.length - 1];
  const trophyPos = last ? { x: last.x, y: last.y + VERTICAL_SPACING * 0.85 } : { x: 0, y: 0 };
  const pathPositions = last ? [...positions, trophyPos] : positions;
  const pathD = buildSmoothPath(pathPositions.map((p) => ({ x: renderX(p.x), y: renderY(p.y) })));

  const centerX = coreWidth / 2;
  const palmTrees = positions
    .map((p, i) => ({ y: p.y, i }))
    .filter(({ i }) => i > 0 && i % 5 === 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-foreground-muted">Game Pass</span>
        <Link href="/" className="text-[11px] uppercase tracking-wider text-foreground-muted hover:text-accent">
          Home
        </Link>
      </div>
      <h1 className="mt-1 flex items-center justify-center gap-3 font-hollywood text-4xl uppercase tracking-[0.08em] text-accent">
        <Star size={20} className="shrink-0 fill-accent text-accent" />
        {board.season.theme_name}
        <Star size={20} className="shrink-0 fill-accent text-accent" />
      </h1>
      <p className="mt-2 text-center text-sm text-foreground-muted">{board.season.theme_description}</p>
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
          width={boardWidth}
          height={boardHeight}
          viewBox={`0 0 ${boardWidth} ${boardHeight}`}
          className="mx-auto"
          role="img"
          aria-label={`${board.season.theme_name} Game Pass board, ${watchedCount} of ${board.days.length} days watched`}
        >
          <g transform={`translate(${SIDE_PADDING} ${PADDING})`}>
            <HollywoodSignBanner width={coreWidth} height={BANNER_HEIGHT} />
          </g>

          <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={3} strokeDasharray="1 12" strokeLinecap="round" opacity={0.55} />

          {palmTrees.map(({ y, i }) => (
            <PalmTree
              key={i}
              x={renderX(i % 10 === 0 ? centerX - AMPLITUDE - 55 : centerX + AMPLITUDE + 55)}
              y={renderY(y) + 44}
              flip={i % 10 === 0}
            />
          ))}

          {board.days.map((day, i) => (
            <StarTile
              key={day.dayNumber}
              x={renderX(positions[i].x)}
              y={renderY(positions[i].y)}
              dayNumber={day.dayNumber}
              titleId={day.title.id}
              titleName={day.title.name}
              posterUrl={day.title.poster_url}
              status={day.status}
            />
          ))}

          {/* Theater marker + trophy — the season's reward, past the last star. */}
          <TheaterMarker x={renderX(trophyPos.x)} y={renderY(trophyPos.y)} />
          <g transform={`translate(${renderX(trophyPos.x)} ${renderY(trophyPos.y)})`}>
            {board.completed && <circle r={52} fill="var(--accent)" opacity={0.16} />}
            <circle
              r={36}
              fill={board.completed ? "var(--accent)" : "var(--surface-raised)"}
              stroke="var(--accent)"
              strokeWidth={2.5}
              opacity={board.completed ? 1 : 0.5}
            />
            <path
              d="M-14,-11 L-14,-1.5 A14,14 0 0 0 14,-1.5 L14,-11 M-18,-11 L18,-11 M-8.5,-11 A8.5,10 0 0 0 8.5,-11 M-3,6 L3,6 L3,11 L8.5,11 L8.5,14 L-8.5,14 L-8.5,11 L-3,11 Z"
              stroke={board.completed ? "var(--accent-foreground)" : "var(--foreground-muted)"}
              strokeWidth={1.8}
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
