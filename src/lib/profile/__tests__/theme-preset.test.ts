import { describe, it, expect } from "vitest";
import { resolveProfileTheme, resolveTasteTheme, resolveTheme } from "@/lib/profile/theme-preset";

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

describe("resolveTasteTheme", () => {
  const archetypes = (top: { name: string; percent: number }, ...rest: { name: string; percent: number }[]) => [
    top,
    ...rest,
  ];

  it("returns default when sample size is below the trust threshold", () => {
    const result = resolveTasteTheme([{ name: "Neo-Noir", percent: 80 }], 3);
    expect(result.id).toBe("default");
  });

  it("returns default when no archetype clearly leads", () => {
    const result = resolveTasteTheme(
      archetypes({ name: "Neo-Noir", percent: 22 }, { name: "Feel-Good Comfort", percent: 20 }),
      10
    );
    expect(result.id).toBe("default");
  });

  it("returns default for an empty archetype list", () => {
    expect(resolveTasteTheme([], 10).id).toBe("default");
  });

  it("maps a dominant Neo-Noir archetype to the noir theme", () => {
    const result = resolveTasteTheme(archetypes({ name: "Neo-Noir", percent: 55 }), 10);
    expect(result.id).toBe("noir");
    expect(result.vars["--accent"]).toBeTruthy();
    expect(result.showMotif).toBe(false);
  });

  it("maps Psychological Slow Burn to the same noir theme as Neo-Noir", () => {
    const result = resolveTasteTheme(archetypes({ name: "Psychological Slow Burn", percent: 40 }), 10);
    expect(result.id).toBe("noir");
  });

  it("maps a dominant Horror & Dread archetype to the dread theme", () => {
    expect(resolveTasteTheme(archetypes({ name: "Horror & Dread", percent: 60 }), 8).id).toBe("dread");
  });

  it("maps Feel-Good Comfort and Witty Comedy to the same comfort theme", () => {
    expect(resolveTasteTheme(archetypes({ name: "Feel-Good Comfort", percent: 45 }), 8).id).toBe("comfort");
    expect(resolveTasteTheme(archetypes({ name: "Witty Comedy", percent: 45 }), 8).id).toBe("comfort");
  });

  it("maps Prestige Drama and Emotional Character Study to the same prestige theme", () => {
    expect(resolveTasteTheme(archetypes({ name: "Prestige Drama", percent: 35 }), 8).id).toBe("prestige");
    expect(resolveTasteTheme(archetypes({ name: "Emotional Character Study", percent: 35 }), 8).id).toBe(
      "prestige"
    );
  });

  it("maps World Cinema Explorer and Experimental Cinema to the same explorer theme", () => {
    expect(resolveTasteTheme(archetypes({ name: "World Cinema Explorer", percent: 35 }), 8).id).toBe("explorer");
    expect(resolveTasteTheme(archetypes({ name: "Experimental Cinema", percent: 35 }), 8).id).toBe("explorer");
  });

  it("falls back to default for a dominant archetype with no mapping (Blockbuster Spectacle)", () => {
    expect(resolveTasteTheme(archetypes({ name: "Blockbuster Spectacle", percent: 70 }), 10).id).toBe("default");
  });

  it("treats the dominance threshold as inclusive", () => {
    expect(resolveTasteTheme(archetypes({ name: "Neo-Noir", percent: 30 }), 10).id).toBe("noir");
    expect(resolveTasteTheme(archetypes({ name: "Neo-Noir", percent: 29 }), 10).id).toBe("default");
  });

  it("treats the sample-size threshold as inclusive", () => {
    expect(resolveTasteTheme(archetypes({ name: "Neo-Noir", percent: 50 }), 6).id).toBe("noir");
    expect(resolveTasteTheme(archetypes({ name: "Neo-Noir", percent: 50 }), 5).id).toBe("default");
  });
});

describe("resolveTheme", () => {
  it("prefers the exact-title tier over the archetype tier when both are present", () => {
    const result = resolveTheme({
      topFavoriteName: "The Godfather",
      archetypes: [{ name: "Horror & Dread", percent: 90 }],
      sampleSize: 20,
    });
    expect(result.id).toBe("godfather");
  });

  it("falls back to the archetype tier when there's no exact-title match", () => {
    const result = resolveTheme({
      topFavoriteName: "The Batman",
      archetypes: [{ name: "Neo-Noir", percent: 55 }],
      sampleSize: 10,
    });
    expect(result.id).toBe("noir");
  });

  it("falls back to default when neither tier has a confident match", () => {
    const result = resolveTheme({ topFavoriteName: null, archetypes: [], sampleSize: 0 });
    expect(result.id).toBe("default");
  });

  it("tolerates missing archetypes/sampleSize entirely", () => {
    expect(resolveTheme({ topFavoriteName: "The Batman" }).id).toBe("default");
  });
});
