import { describe, expect, it } from "vitest";
import {
  computeElapsedSeconds,
  computeProgressPercent,
  formatClock,
  formatRemaining,
  hasReachedRuntime,
} from "@/lib/watch-sessions/progress";

const NOW = new Date("2026-08-24T20:00:00.000Z").getTime();

describe("computeElapsedSeconds", () => {
  it("returns accumulatedSeconds as-is when paused", () => {
    expect(
      computeElapsedSeconds({ status: "paused", accumulatedSeconds: 300, startedAt: new Date(NOW).toISOString() }, NOW)
    ).toBe(300);
  });

  it("returns accumulatedSeconds as-is when completed", () => {
    expect(
      computeElapsedSeconds({ status: "completed", accumulatedSeconds: 7200, startedAt: new Date(NOW).toISOString() }, NOW)
    ).toBe(7200);
  });

  it("adds the current playing segment to accumulatedSeconds", () => {
    const startedAt = new Date(NOW - 90_000).toISOString(); // 90s ago
    expect(computeElapsedSeconds({ status: "playing", accumulatedSeconds: 60, startedAt }, NOW)).toBe(150);
  });

  it("floors a negative segment (clock skew) at zero rather than going backwards", () => {
    const startedAt = new Date(NOW + 10_000).toISOString(); // in the future
    expect(computeElapsedSeconds({ status: "playing", accumulatedSeconds: 60, startedAt }, NOW)).toBe(60);
  });

  it("never returns a negative number", () => {
    expect(computeElapsedSeconds({ status: "paused", accumulatedSeconds: -5, startedAt: new Date(NOW).toISOString() }, NOW)).toBe(0);
  });
});

describe("computeProgressPercent", () => {
  it("returns null for unknown runtime", () => {
    expect(computeProgressPercent(600, null)).toBeNull();
    expect(computeProgressPercent(600, 0)).toBeNull();
  });

  it("computes a clean percentage mid-film", () => {
    expect(computeProgressPercent(30 * 60, 120)).toBe(25);
  });

  it("clamps at 100 once elapsed exceeds runtime", () => {
    expect(computeProgressPercent(200 * 60, 120)).toBe(100);
  });

  it("is 0 at the very start", () => {
    expect(computeProgressPercent(0, 120)).toBe(0);
  });
});

describe("hasReachedRuntime", () => {
  it("is false for unknown runtime regardless of elapsed time", () => {
    expect(hasReachedRuntime(999_999, null)).toBe(false);
  });

  it("is false before runtime is reached", () => {
    expect(hasReachedRuntime(60 * 60, 120)).toBe(false);
  });

  it("is true exactly at runtime", () => {
    expect(hasReachedRuntime(120 * 60, 120)).toBe(true);
  });

  it("is true past runtime", () => {
    expect(hasReachedRuntime(130 * 60, 120)).toBe(true);
  });
});

describe("formatClock", () => {
  it("formats under an hour as MM:SS", () => {
    expect(formatClock(45)).toBe("00:45");
    expect(formatClock(605)).toBe("10:05");
  });

  it("formats an hour or more as H:MM:SS", () => {
    expect(formatClock(3661)).toBe("1:01:01");
  });

  it("floors fractional seconds", () => {
    expect(formatClock(59.9)).toBe("00:59");
  });

  it("never goes negative", () => {
    expect(formatClock(-10)).toBe("00:00");
  });
});

describe("formatRemaining", () => {
  it("returns null for unknown runtime", () => {
    expect(formatRemaining(600, null)).toBeNull();
  });

  it("returns null once time has run out", () => {
    expect(formatRemaining(120 * 60, 120)).toBeNull();
  });

  it("rounds to the nearest minute, floors at 1 min left", () => {
    expect(formatRemaining(119 * 60 + 45, 120)).toBe("1 min left");
  });

  it("formats a normal mid-film remaining time", () => {
    expect(formatRemaining(30 * 60, 120)).toBe("90 min left");
  });
});
