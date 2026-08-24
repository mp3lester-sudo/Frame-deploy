import { describe, expect, it } from "vitest";
import { computeFrequentCollaborators, type CollaboratorCredit } from "../collaborators";

function credit(titleId: string, personId: string, personName: string, photoUrl: string | null = null): CollaboratorCredit {
  return { titleId, personId, personName, photoUrl };
}

describe("computeFrequentCollaborators", () => {
  it("returns nothing for an empty credit list", () => {
    expect(computeFrequentCollaborators([], "me")).toEqual([]);
  });

  it("excludes the current person from their own results", () => {
    const credits = [credit("t1", "me", "Me"), credit("t1", "me", "Me")];
    expect(computeFrequentCollaborators(credits, "me")).toEqual([]);
  });

  it("drops a collaborator under the minimum shared-title threshold", () => {
    const credits = [credit("t1", "a", "Alice")];
    expect(computeFrequentCollaborators(credits, "me")).toEqual([]);
  });

  it("counts a collaborator who clears the threshold", () => {
    const credits = [credit("t1", "a", "Alice"), credit("t2", "a", "Alice")];
    const result = computeFrequentCollaborators(credits, "me");
    expect(result).toEqual([
      { personId: "a", personName: "Alice", photoUrl: null, sharedTitleCount: 2 },
    ]);
  });

  it("counts distinct titles, not distinct credit rows", () => {
    // Same title twice (e.g. writer + director credit) shouldn't double count.
    const credits = [
      credit("t1", "a", "Alice"),
      credit("t1", "a", "Alice"),
      credit("t2", "a", "Alice"),
    ];
    const result = computeFrequentCollaborators(credits, "me");
    expect(result[0].sharedTitleCount).toBe(2);
  });

  it("ranks by shared-title count descending", () => {
    const credits = [
      credit("t1", "a", "Alice"),
      credit("t2", "a", "Alice"),
      credit("t1", "b", "Bob"),
      credit("t2", "b", "Bob"),
      credit("t3", "b", "Bob"),
    ];
    const result = computeFrequentCollaborators(credits, "me");
    expect(result.map((c) => c.personId)).toEqual(["b", "a"]);
  });

  it("breaks ties alphabetically by name for a deterministic order", () => {
    const credits = [
      credit("t1", "z", "Zara"),
      credit("t2", "z", "Zara"),
      credit("t1", "a", "Aaron"),
      credit("t2", "a", "Aaron"),
    ];
    const result = computeFrequentCollaborators(credits, "me");
    expect(result.map((c) => c.personId)).toEqual(["a", "z"]);
  });

  it("caps results at the given limit", () => {
    const credits: CollaboratorCredit[] = [];
    for (const id of ["a", "b", "c", "d"]) {
      credits.push(credit("t1", id, id), credit("t2", id, id));
    }
    const result = computeFrequentCollaborators(credits, "me", 2);
    expect(result).toHaveLength(2);
  });

  it("keeps the first-seen name/photo for a person across multiple rows", () => {
    const credits = [
      credit("t1", "a", "Alice", "photo1.jpg"),
      credit("t2", "a", "Alice", "photo1.jpg"),
    ];
    const result = computeFrequentCollaborators(credits, "me");
    expect(result[0].photoUrl).toBe("photo1.jpg");
  });
});
