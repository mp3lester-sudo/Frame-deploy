import { describe, it, expect } from "vitest";
import {
  validateListTitle,
  validateListDescription,
  validateListItemNote,
  LIST_TITLE_MAX,
  LIST_DESCRIPTION_MAX,
  LIST_ITEM_NOTE_MAX,
} from "@/lib/lists/validate";

describe("validateListTitle", () => {
  it("accepts a normal title", () => {
    expect(validateListTitle("Best Heist Movies")).toEqual({ ok: true, value: "Best Heist Movies" });
  });
  it("trims surrounding whitespace", () => {
    expect(validateListTitle("  Sunday Rewatches  ")).toEqual({ ok: true, value: "Sunday Rewatches" });
  });
  it("rejects an empty title", () => {
    expect(validateListTitle("   ").ok).toBe(false);
  });
  it(`rejects a title over ${LIST_TITLE_MAX} characters`, () => {
    expect(validateListTitle("a".repeat(LIST_TITLE_MAX + 1)).ok).toBe(false);
  });
  it(`accepts a title at exactly ${LIST_TITLE_MAX} characters`, () => {
    expect(validateListTitle("a".repeat(LIST_TITLE_MAX)).ok).toBe(true);
  });
});

describe("validateListDescription", () => {
  it("accepts an empty description (optional field)", () => {
    expect(validateListDescription("")).toEqual({ ok: true, value: "" });
  });
  it("accepts a normal description", () => {
    expect(validateListDescription("Movies where the crew pulls off the impossible.").ok).toBe(true);
  });
  it(`rejects a description over ${LIST_DESCRIPTION_MAX} characters`, () => {
    expect(validateListDescription("a".repeat(LIST_DESCRIPTION_MAX + 1)).ok).toBe(false);
  });
});

describe("validateListItemNote", () => {
  it("accepts an empty note (optional field)", () => {
    expect(validateListItemNote("")).toEqual({ ok: true, value: "" });
  });
  it("accepts a normal note", () => {
    expect(validateListItemNote("The vault sequence alone earns this a spot.").ok).toBe(true);
  });
  it(`rejects a note over ${LIST_ITEM_NOTE_MAX} characters`, () => {
    expect(validateListItemNote("a".repeat(LIST_ITEM_NOTE_MAX + 1)).ok).toBe(false);
  });
});
