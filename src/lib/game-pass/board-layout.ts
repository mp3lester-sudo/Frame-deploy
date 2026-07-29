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

export function computeBoardLayout(dayCount: number, columns: number, tileSpacing: number): TilePosition[] {
  const positions: TilePosition[] = [];
  for (let i = 0; i < dayCount; i++) {
    const rowIndex = Math.floor(i / columns);
    const colInRow = i % columns;
    const isEvenRow = rowIndex % 2 === 0;
    const col = isEvenRow ? colInRow : columns - 1 - colInRow;
    positions.push({ x: col * tileSpacing, y: rowIndex * tileSpacing });
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
