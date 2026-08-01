import { describe, expect, it } from "vitest";
import {
  normalizeParticipantScores,
  aggregateGroupScores,
  rankGroupCandidates,
  buildGroupConsensusNote,
  buildGroupConsensusHeadline,
  type ParticipantScores,
  type ParticipantCitation,
} from "../group-fairness";

describe("normalizeParticipantScores", () => {
  it("maps a range of scores to 0-1", () => {
    const result = normalizeParticipantScores(new Map([["a", 0.5], ["b", 0.9], ["c", 0.1]]));
    expect(result.get("c")).toBe(0);
    expect(result.get("b")).toBe(1);
    expect(result.get("a")).toBeCloseTo(0.5, 5);
  });

  it("maps identical scores to 1 rather than dividing by zero", () => {
    const result = normalizeParticipantScores(new Map([["a", 0.7], ["b", 0.7]]));
    expect(result.get("a")).toBe(1);
    expect(result.get("b")).toBe(1);
  });

  it("returns an empty map for no scores", () => {
    expect(normalizeParticipantScores(new Map()).size).toBe(0);
  });
});

describe("aggregateGroupScores", () => {
  it("doesn't let one person's higher raw magnitude dominate the group average", () => {
    // Alice's scores run "hot" (0.9 for movieA), Bob's run "cool" (0.5 for
    // movieB). Raw-average would favor movieA (0.9+0.2)/2=0.55 vs movieB's
    // (0.3+0.5)/2=0.4. Normalized per-person, movieA is Alice's best but
    // Bob's worst (0 after normalization), while movieB is a solid middle
    // pick for both — that's the "happy medium" this function should surface.
    const alice: ParticipantScores = {
      userId: "alice",
      scores: new Map([["movieA", 0.9], ["movieB", 0.3], ["movieC", 0.1]]),
    };
    const bob: ParticipantScores = {
      userId: "bob",
      scores: new Map([["movieA", 0.2], ["movieB", 0.5], ["movieC", 0.45]]),
    };
    const results = aggregateGroupScores([alice, bob], { floor: 0 });
    const byId = new Map(results.map((r) => [r.titleId, r]));
    // movieA: alice normalized 1 (best), bob normalized 0 (worst) -> avg 0.5
    // movieB: alice normalized 0.25, bob normalized 1 (best) -> avg 0.625
    expect(byId.get("movieB")!.averageNormalized).toBeGreaterThan(byId.get("movieA")!.averageNormalized);
  });

  it("excludes a title not scored for every active participant", () => {
    const alice: ParticipantScores = { userId: "alice", scores: new Map([["movieA", 0.8]]) };
    const bob: ParticipantScores = { userId: "bob", scores: new Map([["movieB", 0.8]]) }; // never scored movieA
    const results = aggregateGroupScores([alice, bob], { floor: 0 });
    expect(results.find((r) => r.titleId === "movieA")).toBeUndefined();
    expect(results.find((r) => r.titleId === "movieB")).toBeUndefined();
  });

  it("ignores a participant with no taste vector yet (empty scores) rather than vetoing everything", () => {
    const alice: ParticipantScores = { userId: "alice", scores: new Map([["movieA", 0.8]]) };
    const noTasteYet: ParticipantScores = { userId: "newbie", scores: new Map() };
    const results = aggregateGroupScores([alice, noTasteYet], { floor: 0 });
    expect(results.find((r) => r.titleId === "movieA")).toBeDefined();
  });

  it("returns nothing when nobody has a taste vector", () => {
    expect(aggregateGroupScores([{ userId: "a", scores: new Map() }])).toEqual([]);
  });

  it("applies the floor: a title that's a clear miss for anyone fails passesFloor", () => {
    const alice: ParticipantScores = { userId: "alice", scores: new Map([["x", 1], ["y", 0]]) };
    const bob: ParticipantScores = { userId: "bob", scores: new Map([["x", 0], ["y", 1]]) };
    const results = aggregateGroupScores([alice, bob], { floor: 0.35 });
    // both x and y are a 0 (worst) for one of the two people
    expect(results.every((r) => !r.passesFloor)).toBe(true);
  });
});

describe("rankGroupCandidates", () => {
  it("excludes a title that's a clear miss for one participant even if it's fine for the other, and ranks the genuinely fair pick first", () => {
    const alice: ParticipantScores = {
      userId: "alice",
      scores: new Map([["extreme", 1.0], ["balanced", 0.6], ["low", 0.0]]),
    };
    const bob: ParticipantScores = {
      // bob's "extreme" normalizes to 0.125 (a near-miss, below the 0.35
      // floor) even though his raw score isn't literally his rock-bottom —
      // this is exactly the case a hard floor needs to catch.
      userId: "bob",
      scores: new Map([["extreme", 0.15], ["balanced", 0.5], ["low", 0.1]]),
    };
    const ranked = rankGroupCandidates([alice, bob]);
    expect(ranked.find((r) => r.titleId === "extreme")).toBeUndefined();
    expect(ranked[0].titleId).toBe("balanced");
  });

  it("relaxes the floor rather than returning nothing for genuinely divergent tastes", () => {
    // Every title is someone's worst (0) — nothing can clear even a low floor.
    const alice: ParticipantScores = { userId: "alice", scores: new Map([["x", 1], ["y", 0]]) };
    const bob: ParticipantScores = { userId: "bob", scores: new Map([["x", 0], ["y", 1]]) };
    const ranked = rankGroupCandidates([alice, bob]);
    expect(ranked.length).toBeGreaterThan(0);
  });

  it("returns nothing when there are no active participants at all", () => {
    expect(rankGroupCandidates([{ userId: "a", scores: new Map() }])).toEqual([]);
  });
});

describe("buildGroupConsensusNote", () => {
  const names = new Map([["alice", "Alice"], ["bob", "Bob"]]);

  it("calls out a strong match for everyone", () => {
    const candidate = {
      titleId: "x",
      averageNormalized: 0.9,
      passesFloor: true,
      perParticipant: [
        { userId: "alice", normalized: 0.9 },
        { userId: "bob", normalized: 0.8 },
      ],
    };
    expect(buildGroupConsensusNote(candidate, names)).toBe("A strong match for everyone in the group.");
  });

  it("names who a pick leans toward when it's not uniformly high", () => {
    const candidate = {
      titleId: "x",
      averageNormalized: 0.5,
      passesFloor: true,
      perParticipant: [
        { userId: "alice", normalized: 0.9 },
        { userId: "bob", normalized: 0.4 },
      ],
    };
    expect(buildGroupConsensusNote(candidate, names)).toBe("Leans toward Alice's taste, but still clears the bar for everyone.");
  });

  it("handles a solo movie night without naming anyone", () => {
    const candidate = {
      titleId: "x",
      averageNormalized: 0.5,
      passesFloor: true,
      perParticipant: [{ userId: "alice", normalized: 0.5 }],
    };
    expect(buildGroupConsensusNote(candidate, names)).toBe("A strong match based on what's rated so far.");
  });
});

describe("buildGroupConsensusHeadline", () => {
  const names = new Map([["alice", "Alice"], ["bob", "Bob"]]);
  const twoPersonCandidate = {
    titleId: "x",
    averageNormalized: 0.5,
    passesFloor: true,
    perParticipant: [
      { userId: "alice", normalized: 0.9 },
      { userId: "bob", normalized: 0.4 },
    ],
  };

  it("falls back to the generic consensus note when nobody has a citation", () => {
    const headline = buildGroupConsensusHeadline(twoPersonCandidate, names, []);
    expect(headline).toBe(buildGroupConsensusNote(twoPersonCandidate, names));
  });

  it("calls out a shared title when both participants cited the same one", () => {
    const citations: ParticipantCitation[] = [
      { userId: "alice", citedTitles: ["Se7en", "Zodiac"] },
      { userId: "bob", citedTitles: ["Se7en"] },
    ];
    const headline = buildGroupConsensusHeadline(twoPersonCandidate, names, citations);
    expect(headline).toBe("Because you both loved Se7en.");
  });

  it("names each person's own citation when they differ", () => {
    const citations: ParticipantCitation[] = [
      { userId: "alice", citedTitles: ["Lost Highway"] },
      { userId: "bob", citedTitles: ["Zodiac"] },
    ];
    const headline = buildGroupConsensusHeadline(twoPersonCandidate, names, citations);
    expect(headline).toBe("Alice loved Lost Highway; Bob loved Zodiac.");
  });

  it("folds a single citation into the existing consensus framing", () => {
    const citations: ParticipantCitation[] = [{ userId: "alice", citedTitles: ["Lost Highway"] }];
    const headline = buildGroupConsensusHeadline(twoPersonCandidate, names, citations);
    expect(headline).toContain("Alice loved Lost Highway");
    expect(headline.toLowerCase()).toContain("leans toward alice's taste");
  });

  it("uses the solo single-citation phrasing for a movie night of one", () => {
    const soloCandidate = {
      titleId: "x",
      averageNormalized: 0.9,
      passesFloor: true,
      perParticipant: [{ userId: "alice", normalized: 0.9 }],
    };
    const citations: ParticipantCitation[] = [{ userId: "alice", citedTitles: ["Se7en"] }];
    expect(buildGroupConsensusHeadline(soloCandidate, names, citations)).toBe("Because you loved Se7en.");
  });

  it("uses the two-title solo phrasing when there are two citations for one person", () => {
    const soloCandidate = {
      titleId: "x",
      averageNormalized: 0.9,
      passesFloor: true,
      perParticipant: [{ userId: "alice", normalized: 0.9 }],
    };
    const citations: ParticipantCitation[] = [{ userId: "alice", citedTitles: ["Se7en", "Zodiac"] }];
    expect(buildGroupConsensusHeadline(soloCandidate, names, citations)).toBe("Because you loved Se7en and Zodiac.");
  });

  it("says 'everyone' rather than 'you both' for a shared title across more than two people", () => {
    const threePersonCandidate = {
      titleId: "x",
      averageNormalized: 0.7,
      passesFloor: true,
      perParticipant: [
        { userId: "alice", normalized: 0.8 },
        { userId: "bob", normalized: 0.7 },
        { userId: "carol", normalized: 0.6 },
      ],
    };
    const namesWithCarol = new Map([...names, ["carol", "Carol"]]);
    const citations: ParticipantCitation[] = [
      { userId: "alice", citedTitles: ["Se7en"] },
      { userId: "bob", citedTitles: ["Se7en"] },
      { userId: "carol", citedTitles: ["Se7en"] },
    ];
    const headline = buildGroupConsensusHeadline(threePersonCandidate, namesWithCarol, citations);
    expect(headline).toBe("Because everyone loved Se7en.");
  });
});
