import { describe, expect, it } from "vitest";
import { boardBounds, buildPathPoints, computeBoardLayout } from "../board-layout";

describe("computeBoardLayout", () => {
  it("lays out the first row left-to-right", () => {
    const positions = computeBoardLayout(5, 5, 100);
    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
      { x: 300, y: 0 },
      { x: 400, y: 0 },
    ]);
  });

  it("reverses the second row (snake pattern)", () => {
    const positions = computeBoardLayout(10, 5, 100);
    const secondRow = positions.slice(5, 10);
    expect(secondRow).toEqual([
      { x: 400, y: 100 },
      { x: 300, y: 100 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
  });

  it("connects day 5 (end of row 1) to day 6 (start of row 2 reversed) adjacently", () => {
    const positions = computeBoardLayout(10, 5, 100);
    // Day 5 (index 4) is the last tile of row 0; day 6 (index 5) should sit
    // directly below it, not jump across the board — that's the whole
    // point of reversing alternate rows.
    expect(positions[4]).toEqual({ x: 400, y: 0 });
    expect(positions[5]).toEqual({ x: 400, y: 100 });
  });

  it("handles a partial final row without throwing", () => {
    const positions = computeBoardLayout(28, 5, 100);
    expect(positions).toHaveLength(28);
    // Row 5 (rowIndex 5, odd -> right-to-left) is partial — 3 tiles
    // (indices 25,26,27) — starts from the right edge (col 4), same as any
    // other odd row, snake pattern doesn't special-case a short row.
    expect(positions[25]).toEqual({ x: 400, y: 500 });
    expect(positions[27]).toEqual({ x: 200, y: 500 });
  });

  it("returns an empty array for zero days", () => {
    expect(computeBoardLayout(0, 5, 100)).toEqual([]);
  });

  it("supports a separate row spacing (taller tiles need more vertical room than horizontal)", () => {
    const positions = computeBoardLayout(8, 4, 130, 190);
    expect(positions[0]).toEqual({ x: 0, y: 0 });
    expect(positions[3]).toEqual({ x: 390, y: 0 });
    // Row 1 (reversed) starts at col 3 again, but at the taller row spacing.
    expect(positions[4]).toEqual({ x: 390, y: 190 });
    expect(positions[7]).toEqual({ x: 0, y: 190 });
  });
});

describe("buildPathPoints", () => {
  it("formats positions as an SVG points string", () => {
    expect(buildPathPoints([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe("0,0 100,0");
  });

  it("returns an empty string for no positions", () => {
    expect(buildPathPoints([])).toBe("");
  });
});

describe("boardBounds", () => {
  it("computes width/height from the max extent plus padding", () => {
    const positions = computeBoardLayout(10, 5, 100);
    expect(boardBounds(positions, 50)).toEqual({ width: 400 + 100, height: 100 + 100 });
  });

  it("returns just padding for an empty board", () => {
    expect(boardBounds([], 50)).toEqual({ width: 100, height: 100 });
  });
});
