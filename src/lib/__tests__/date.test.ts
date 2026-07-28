import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDistanceToNow } from "@/lib/date";

describe("formatDistanceToNow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats seconds, minutes, hours, and days correctly", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(formatDistanceToNow(new Date(now.getTime() - 30_000).toISOString())).toBe("30 seconds ago");
    expect(formatDistanceToNow(new Date(now.getTime() - 5 * 60_000).toISOString())).toBe("5 minutes ago");
    expect(formatDistanceToNow(new Date(now.getTime() - 3 * 3_600_000).toISOString())).toBe("3 hours ago");
    expect(formatDistanceToNow(new Date(now.getTime() - 2 * 86_400_000).toISOString())).toBe("2 days ago");
  });

  it("uses singular units for a value of exactly one", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(formatDistanceToNow(new Date(now.getTime() - 60_000).toISOString())).toBe("1 minute ago");
  });
});
