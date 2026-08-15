import { describe, expect, it } from "vitest";
import { pickDirectorOfDay, rankFavoriteDirectors } from "../pick";

describe("rankFavoriteDirectors", () => {
  it("returns an empty list when there are no ratings", () => {
    expect(rankFavoriteDirectors([], new Map())).toEqual([]);
  });

  it("ignores ratings at or below the 2.5 midpoint (no positive signal)", () => {
    const directorByTitle = new Map([["t1", { id: "d1", name: "Denis Villeneuve" }]]);
    const result = rankFavoriteDirectors([{ titleId: "t1", score: 2.5 }], directorByTitle);
    expect(result).toEqual([]);
  });

  it("ignores titles with no known director", () => {
    const result = rankFavoriteDirectors([{ titleId: "t1", score: 5 }], new Map());
    expect(result).toEqual([]);
  });

  it("accumulates weight across multiple rated titles by the same director", () => {
    const directorByTitle = new Map([
      ["t1", { id: "d1", name: "Denis Villeneuve" }],
      ["t2", { id: "d1", name: "Denis Villeneuve" }],
    ]);
    const result = rankFavoriteDirectors(
      [
        { titleId: "t1", score: 5 },
        { titleId: "t2", score: 4 },
      ],
      directorByTitle
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("d1");
    expect(result[0].score).toBeCloseTo(2.5 + 1.5, 5);
  });

  it("ranks the director with more/higher above-average ratings first", () => {
    const directorByTitle = new Map([
      ["t1", { id: "d1", name: "A" }],
      ["t2", { id: "d2", name: "B" }],
    ]);
    const result = rankFavoriteDirectors(
      [
        { titleId: "t1", score: 5 },
        { titleId: "t2", score: 3 },
      ],
      directorByTitle
    );
    expect(result[0].id).toBe("d1");
    expect(result[1].id).toBe("d2");
  });
});

describe("pickDirectorOfDay", () => {
  // pickDirectorOfDay is generic over any { id: string } candidate (it's
  // reused as-is for Creator Spotlight, see creator-spotlight/pick.ts) --
  // these tests use plain { id } objects rather than bare strings to
  // match that signature.
  const candidate = (id: string) => ({ id });

  it("returns null for an empty candidate list", () => {
    expect(pickDirectorOfDay([], "user-1", "2026-07-31")).toBeNull();
  });

  it("returns the single candidate when there's only one", () => {
    expect(pickDirectorOfDay([candidate("only")], "user-1", "2026-07-31")).toEqual(candidate("only"));
  });

  it("is deterministic: same user + same day always picks the same candidate", () => {
    const candidates = ["a", "b", "c", "d", "e"].map(candidate);
    const first = pickDirectorOfDay(candidates, "user-1", "2026-07-31");
    const second = pickDirectorOfDay(candidates, "user-1", "2026-07-31");
    expect(first).toEqual(second);
  });

  it("changes when the day changes", () => {
    const candidates = ["a", "b", "c", "d", "e", "f", "g", "h"].map(candidate);
    const picks = new Set<string>();
    for (let day = 1; day <= 8; day++) {
      const pick = pickDirectorOfDay(candidates, "user-1", `2026-07-${String(day).padStart(2, "0")}`);
      picks.add(pick!.id);
    }
    // Over 8 distinct days with 8 candidates, expect real variation, not
    // the exact same pick every day (that would indicate the day isn't
    // actually part of the seed).
    expect(picks.size).toBeGreaterThan(1);
  });

  it("different users can get different picks on the same day", () => {
    const candidates = ["a", "b", "c", "d", "e", "f", "g", "h"].map(candidate);
    const picks = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const pick = pickDirectorOfDay(candidates, `user-${i}`, "2026-07-31");
      picks.add(pick!.id);
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});
