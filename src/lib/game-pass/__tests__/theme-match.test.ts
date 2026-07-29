import { describe, expect, it } from "vitest";
import { titleMatchesTheme, type ThemeMatchableTitle } from "../theme-match";
import type { ThemePreset } from "../themes";

function title(overrides: Partial<ThemeMatchableTitle> = {}): ThemeMatchableTitle {
  return {
    genres: ["Drama"],
    tone: [],
    themes: [],
    mood_tags: [],
    release_date: "1995-06-01",
    ...overrides,
  };
}

function theme(overrides: Partial<ThemePreset> = {}): ThemePreset {
  return {
    name: "Test Theme",
    description: "",
    genres: ["Drama"],
    keywords: [],
    decadeMin: null,
    decadeMax: null,
    ...overrides,
  };
}

describe("titleMatchesTheme", () => {
  it("matches on genre overlap", () => {
    expect(titleMatchesTheme(title({ genres: ["Drama", "Romance"] }), theme({ genres: ["Drama"] }))).toBe(true);
  });

  it("matches on keyword substring in tone/themes/mood_tags", () => {
    const t = title({ genres: ["Horror"], tone: ["dark", "legendary status"] });
    expect(titleMatchesTheme(t, theme({ genres: ["Drama"], keywords: ["legendary"] }))).toBe(true);
  });

  it("rejects when neither genre nor keyword hits", () => {
    const t = title({ genres: ["Horror"], tone: ["campy"] });
    expect(titleMatchesTheme(t, theme({ genres: ["Drama"], keywords: ["legendary"] }))).toBe(false);
  });

  it("respects a decade range even when genre/keyword otherwise match", () => {
    const t = title({ genres: ["Drama"], release_date: "1975-01-01" });
    expect(titleMatchesTheme(t, theme({ genres: ["Drama"], decadeMin: 1990, decadeMax: 1999 }))).toBe(false);
    expect(titleMatchesTheme(title({ release_date: "1995-01-01" }), theme({ genres: ["Drama"], decadeMin: 1990, decadeMax: 1999 }))).toBe(true);
  });

  it("rejects titles with no release date when a decade range is required", () => {
    const t = title({ release_date: null });
    expect(titleMatchesTheme(t, theme({ decadeMin: 1990, decadeMax: 1999 }))).toBe(false);
  });

  it("a theme with no genres and no keywords matches nothing (not everything)", () => {
    expect(titleMatchesTheme(title(), theme({ genres: [], keywords: [] }))).toBe(false);
  });
});
