import { describe, expect, it } from "vitest";
import { boardBounds, buildPathPoints, buildSmoothPath, computeBoardLayout, computeSwervyPath } from "../board-layout";

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

describe("computeSwervyPath", () => {
  it("returns one position per day, y advancing steadily", () => {
    const positions = computeSwervyPath(10, 190, 110, 6);
    expect(positions).toHaveLength(10);
    positions.forEach((p, i) => expect(p.y).toBe(i * 190));
  });

  it("normalizes so the leftmost point is exactly x=0", () => {
    const positions = computeSwervyPath(20, 190, 110, 6);
    expect(Math.min(...positions.map((p) => p.x))).toBe(0);
  });

  it("stays within the amplitude's full swing width", () => {
    const amplitude = 110;
    const positions = computeSwervyPath(20, 190, amplitude, 6);
    const maxX = Math.max(...positions.map((p) => p.x));
    expect(maxX).toBeLessThanOrEqual(amplitude * 2 + 0.001);
  });

  it("actually swerves — x is not constant across days", () => {
    const positions = computeSwervyPath(12, 190, 110, 6);
    const xs = new Set(positions.map((p) => Math.round(p.x)));
    expect(xs.size).toBeGreaterThan(1);
  });

  it("returns an empty array for zero days", () => {
    expect(computeSwervyPath(0, 190, 110, 6)).toEqual([]);
  });
});

describe("buildSmoothPath", () => {
  it("returns an empty string for no positions", () => {
    expect(buildSmoothPath([])).toBe("");
  });

  it("returns a single moveto for one position", () => {
    expect(buildSmoothPath([{ x: 5, y: 10 }])).toBe("M5,10");
  });

  it("starts at the first point and has one curve segment per gap", () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 50, y: 100 },
      { x: 0, y: 200 },
      { x: 50, y: 300 },
    ];
    const d = buildSmoothPath(positions);
    expect(d.startsWith("M0,0")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(positions.length - 1);
  });

  it("the curve's final segment actually ends at the last point", () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 50, y: 100 },
      { x: 20, y: 200 },
    ];
    const d = buildSmoothPath(positions);
    expect(d.endsWith("20.00,200.00")).toBe(true);
  });
});
