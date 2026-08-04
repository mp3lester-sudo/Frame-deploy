import { describe, it, expect } from "vitest";
import { orderByTmdbIdSequence } from "@/lib/search/company-titles";

describe("orderByTmdbIdSequence", () => {
  it("reorders rows to match the reference tmdb id sequence", () => {
    const rows = [
      { tmdb_id: 300, name: "Third" },
      { tmdb_id: 100, name: "First" },
      { tmdb_id: 200, name: "Second" },
    ];
    const ordered = orderByTmdbIdSequence(rows, [100, 200, 300]);
    expect(ordered.map((r) => r.name)).toEqual(["First", "Second", "Third"]);
  });

  it("pushes rows with no matching tmdb id to the end", () => {
    const rows = [
      { tmdb_id: 999, name: "Unranked" },
      { tmdb_id: 100, name: "First" },
    ];
    const ordered = orderByTmdbIdSequence(rows, [100]);
    expect(ordered.map((r) => r.name)).toEqual(["First", "Unranked"]);
  });

  it("pushes rows with a null tmdb_id to the end", () => {
    const rows = [
      { tmdb_id: null, name: "No id" },
      { tmdb_id: 100, name: "First" },
    ];
    const ordered = orderByTmdbIdSequence(rows, [100]);
    expect(ordered.map((r) => r.name)).toEqual(["First", "No id"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      { tmdb_id: 200, name: "Second" },
      { tmdb_id: 100, name: "First" },
    ];
    const original = [...rows];
    orderByTmdbIdSequence(rows, [100, 200]);
    expect(rows).toEqual(original);
  });
});
