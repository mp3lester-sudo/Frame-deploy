import { describe, it, expect } from "vitest";
import { cn, formatRating, formatRuntime } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and dedupes conflicting tailwind utilities", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", undefined, "font-bold")).toBe("text-sm font-bold");
  });
});

describe("formatRating", () => {
  it("formats a numeric score to one decimal place", () => {
    expect(formatRating(4)).toBe("4.0");
    expect(formatRating(3.5)).toBe("3.5");
  });

  it("returns an em dash for null/undefined", () => {
    expect(formatRating(null)).toBe("—");
    expect(formatRating(undefined)).toBe("—");
  });
});

describe("formatRuntime", () => {
  it("formats minutes into hours and minutes", () => {
    expect(formatRuntime(125)).toBe("2h 5m");
    expect(formatRuntime(45)).toBe("45m");
  });

  it("returns an empty string for falsy input", () => {
    expect(formatRuntime(null)).toBe("");
    expect(formatRuntime(0)).toBe("");
  });
});
