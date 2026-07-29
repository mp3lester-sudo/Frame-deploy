/**
 * Pure geometry for the illustrated board — a boustrophedon ("snake") grid,
 * the same layout convention board games and battle-passes use: fill a row
 * left-to-right, drop down a row, fill it right-to-left, repeat. Kept
 * separate from the rendering component so the coordinate math is testable
 * without a DOM.
 */
export interface TilePosition {
  x: number;
  y: number;
}

export function computeBoardLayout(
  dayCount: number,
  columns: number,
  tileSpacing: number,
  rowSpacing: number = tileSpacing
): TilePosition[] {
  const positions: TilePosition[] = [];
  for (let i = 0; i < dayCount; i++) {
    const rowIndex = Math.floor(i / columns);
    const colInRow = i % columns;
    const isEvenRow = rowIndex % 2 === 0;
    const col = isEvenRow ? colInRow : columns - 1 - colInRow;
    positions.push({ x: col * tileSpacing, y: rowIndex * rowSpacing });
  }
  return positions;
}

/** SVG polyline `points` attribute value connecting tile centers in day
 *  order — the winding "sidewalk" line drawn behind the star tiles. */
export function buildPathPoints(positions: TilePosition[]): string {
  return positions.map((p) => `${p.x},${p.y}`).join(" ");
}

export function boardBounds(positions: TilePosition[], padding: number): { width: number; height: number } {
  if (positions.length === 0) return { width: padding * 2, height: padding * 2 };
  const maxX = Math.max(...positions.map((p) => p.x));
  const maxY = Math.max(...positions.map((p) => p.y));
  return { width: maxX + padding * 2, height: maxY + padding * 2 };
}

/**
 * A single winding vertical path — the "Game of Life" board convention:
 * one lane that swerves left and right as it descends, rather than a grid
 * of rows and columns. y advances steadily with each day; x follows a
 * sine wave so the path curves back and forth every `wavelengthDays`.
 * Always normalized so the leftmost point sits at x=0 (same convention
 * computeBoardLayout uses), so callers can keep treating (0,0) as the
 * top-left of the board's bounding box.
 */
export function computeSwervyPath(
  dayCount: number,
  verticalSpacing: number,
  amplitude: number,
  wavelengthDays: number
): TilePosition[] {
  const raw: TilePosition[] = [];
  for (let i = 0; i < dayCount; i++) {
    const y = i * verticalSpacing;
    const x = amplitude * Math.sin((i / wavelengthDays) * Math.PI * 2);
    raw.push({ x, y });
  }
  if (raw.length === 0) return raw;
  const minX = Math.min(...raw.map((p) => p.x));
  return raw.map((p) => ({ x: p.x - minX, y: p.y }));
}

/**
 * Renders a smooth curve through every position using a Catmull-Rom
 * spline converted to cubic Bezier segments — the standard technique for
 * a road/river that flows through a set of waypoints without kinks,
 * unlike a plain polyline. Endpoints are clamped by duplicating the first
 * and last point as their own neighbors.
 */
export function buildSmoothPath(positions: TilePosition[]): string {
  if (positions.length === 0) return "";
  if (positions.length === 1) return `M${positions[0].x},${positions[0].y}`;

  let d = `M${positions[0].x},${positions[0].y}`;
  for (let i = 0; i < positions.length - 1; i++) {
    const p0 = positions[i - 1] ?? positions[i];
    const p1 = positions[i];
    const p2 = positions[i + 1];
    const p3 = positions[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}
