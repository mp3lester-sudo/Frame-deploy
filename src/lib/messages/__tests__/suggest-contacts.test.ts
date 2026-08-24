import { describe, expect, it } from "vitest";
import { buildSuggestedContacts } from "../suggest-contacts";

describe("buildSuggestedContacts", () => {
  it("returns nothing when both candidate pools are empty", () => {
    expect(buildSuggestedContacts([], [], new Set())).toEqual([]);
  });

  it("ranks compatibility matches by percent, highest first", () => {
    const result = buildSuggestedContacts(
      [
        { userId: "a", percent: 75 },
        { userId: "b", percent: 92 },
      ],
      [],
      new Set()
    );
    expect(result.map((r) => r.userId)).toEqual(["b", "a"]);
  });

  it("filters out compatibility matches below the 70% floor", () => {
    const result = buildSuggestedContacts([{ userId: "a", percent: 65 }], [], new Set());
    expect(result).toEqual([]);
  });

  it("keeps the highest percent when the same user appears twice", () => {
    const result = buildSuggestedContacts(
      [
        { userId: "a", percent: 80 },
        { userId: "a", percent: 95 },
      ],
      [],
      new Set()
    );
    expect(result).toHaveLength(1);
    expect(result[0].detail).toBe(95);
  });

  it("respects excludeUserIds for both pools", () => {
    const result = buildSuggestedContacts(
      [{ userId: "a", percent: 90 }],
      [{ userId: "b", joinedAt: "2026-01-01" }],
      new Set(["a", "b"])
    );
    expect(result).toEqual([]);
  });

  it("fills remaining slots with movie-night co-participants after compatibility matches, most recent first", () => {
    const result = buildSuggestedContacts(
      [{ userId: "a", percent: 90 }],
      [
        { userId: "b", joinedAt: "2026-01-01" },
        { userId: "c", joinedAt: "2026-06-01" },
      ],
      new Set()
    );
    expect(result.map((r) => r.userId)).toEqual(["a", "c", "b"]);
    expect(result[0].reason).toBe("compatibility");
    expect(result[1].reason).toBe("movie_night");
  });

  it("never lists the same user twice even if they appear in both pools", () => {
    const result = buildSuggestedContacts(
      [{ userId: "a", percent: 90 }],
      [{ userId: "a", joinedAt: "2026-01-01" }],
      new Set()
    );
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("compatibility");
  });

  it("keeps the most recent joinedAt when the same user appears twice in movie-night candidates", () => {
    const result = buildSuggestedContacts(
      [],
      [
        { userId: "a", joinedAt: "2026-01-01" },
        { userId: "a", joinedAt: "2026-06-01" },
      ],
      new Set()
    );
    expect(result[0].detail).toBe("2026-06-01");
  });

  it("respects the limit across both pools combined", () => {
    const result = buildSuggestedContacts(
      [
        { userId: "a", percent: 95 },
        { userId: "b", percent: 90 },
      ],
      [
        { userId: "c", joinedAt: "2026-01-01" },
        { userId: "d", joinedAt: "2026-01-02" },
      ],
      new Set(),
      3
    );
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.userId)).toEqual(["a", "b", "d"]);
  });
});
