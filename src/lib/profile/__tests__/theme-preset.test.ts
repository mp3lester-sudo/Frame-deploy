import { describe, it, expect } from "vitest";
import { resolveProfileTheme } from "@/lib/profile/theme-preset";

describe("resolveProfileTheme", () => {
  it("returns the default (no-op) theme for null/undefined/empty", () => {
    expect(resolveProfileTheme(null)).toMatchObject({ id: "default", vars: {}, showMotif: false });
    expect(resolveProfileTheme(undefined)).toMatchObject({ id: "default", vars: {}, showMotif: false });
    expect(resolveProfileTheme("")).toMatchObject({ id: "default", vars: {}, showMotif: false });
  });

  it("returns the default theme for an unrelated title", () => {
    expect(resolveProfileTheme("The Batman").id).toBe("default");
  });

  it("does not match sequels or near-titles, only the exact film", () => {
    expect(resolveProfileTheme("The Godfather Part II").id).toBe("default");
    expect(resolveProfileTheme("The Godfather Part III").id).toBe("default");
    expect(resolveProfileTheme("Tokyo Godfathers").id).toBe("default");
  });

  it("matches The Godfather case-insensitively and trims whitespace", () => {
    expect(resolveProfileTheme("The Godfather").id).toBe("godfather");
    expect(resolveProfileTheme("the godfather").id).toBe("godfather");
    expect(resolveProfileTheme("THE GODFATHER").id).toBe("godfather");
    expect(resolveProfileTheme("  The Godfather  ").id).toBe("godfather");
  });

  it("returns a full CSS variable override set and matching accent rgb for the godfather theme", () => {
    const theme = resolveProfileTheme("The Godfather");
    expect(theme.showMotif).toBe(true);
    expect(theme.vars["--background"]).toBeTruthy();
    expect(theme.vars["--accent"]).toBeTruthy();
    expect(theme.vars["--font-display"]).toBe("var(--font-cinzel)");
    expect(theme.accentRgb).toBe("201,162,39");
  });
});
