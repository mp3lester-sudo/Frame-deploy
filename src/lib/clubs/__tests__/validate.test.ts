import { describe, it, expect } from "vitest";
import {
  validateClubName,
  validateClubDescription,
  validateClubPostBody,
  CLUB_NAME_MAX,
  CLUB_POST_MAX,
} from "@/lib/clubs/validate";

describe("validateClubName", () => {
  it("accepts a normal name", () => {
    expect(validateClubName("Midnight Movie Club")).toEqual({ ok: true, value: "Midnight Movie Club" });
  });
  it("rejects an empty name", () => {
    expect(validateClubName("   ").ok).toBe(false);
  });
  it(`rejects a name over ${CLUB_NAME_MAX} characters`, () => {
    expect(validateClubName("a".repeat(CLUB_NAME_MAX + 1)).ok).toBe(false);
  });
});

describe("validateClubDescription", () => {
  it("accepts an empty description (optional field)", () => {
    expect(validateClubDescription("")).toEqual({ ok: true, value: "" });
  });
  it("accepts a normal description", () => {
    expect(validateClubDescription("We watch one horror movie a week.").ok).toBe(true);
  });
});

describe("validateClubPostBody", () => {
  it("accepts a normal post", () => {
    expect(validateClubPostBody("What should we watch this week?").ok).toBe(true);
  });
  it("rejects an empty post", () => {
    expect(validateClubPostBody("").ok).toBe(false);
  });
  it(`rejects a post over ${CLUB_POST_MAX} characters`, () => {
    expect(validateClubPostBody("a".repeat(CLUB_POST_MAX + 1)).ok).toBe(false);
  });
});
