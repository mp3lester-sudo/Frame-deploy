import { describe, expect, it } from "vitest";
import { pickThemeForMonth, THEME_PRESETS } from "../themes";

describe("pickThemeForMonth", () => {
  it("resolves July 2026 (the epoch month) to Hollywood Boulevard", () => {
    expect(pickThemeForMonth(new Date(Date.UTC(2026, 6, 1))).name).toBe("Hollywood Boulevard");
  });

  it("is deterministic for the same month", () => {
    const a = pickThemeForMonth(new Date(Date.UTC(2027, 2, 1)));
    const b = pickThemeForMonth(new Date(Date.UTC(2027, 2, 1)));
    expect(a.name).toBe(b.name);
  });

  it("rotates to a different theme the following month", () => {
    const july = pickThemeForMonth(new Date(Date.UTC(2026, 6, 1)));
    const august = pickThemeForMonth(new Date(Date.UTC(2026, 7, 1)));
    expect(august.name).not.toBe(july.name);
  });

  it("wraps around correctly after the list is exhausted", () => {
    const wrapped = pickThemeForMonth(new Date(Date.UTC(2026, 6 + THEME_PRESETS.length, 1)));
    expect(wrapped.name).toBe("Hollywood Boulevard");
  });

  it("handles months before the epoch without throwing or going out of bounds", () => {
    const past = pickThemeForMonth(new Date(Date.UTC(2020, 0, 1)));
    expect(THEME_PRESETS.map((t) => t.name)).toContain(past.name);
  });

  it("every preset has a non-empty name/description and at least a genre or keyword to filter on", () => {
    for (const theme of THEME_PRESETS) {
      expect(theme.name.length).toBeGreaterThan(0);
      expect(theme.description.length).toBeGreaterThan(0);
      expect(theme.genres.length + theme.keywords.length).toBeGreaterThan(0);
    }
  });
});
