import { describe, expect, it } from "vitest";
import { contextMultiplier, contextNote, type ContextualTitle } from "../context-weighting";

function title(overrides: Partial<ContextualTitle> = {}): ContextualTitle {
  return {
    runtime_minutes: 110,
    violence_level: 1,
    comedy_level: 1,
    emotional_intensity: 2,
    dialogue_density: 2,
    pacing: "moderate",
    ...overrides,
  };
}

describe("contextMultiplier", () => {
  it("solo never adjusts anything", () => {
    expect(contextMultiplier(title({ violence_level: 5 }), "solo")).toBe(1);
  });

  it("date_night penalizes very violent titles and boosts engaging ones", () => {
    expect(contextMultiplier(title({ violence_level: 4 }), "date_night")).toBe(0.5);
    expect(contextMultiplier(title({ emotional_intensity: 4 }), "date_night")).toBe(1.15);
    expect(contextMultiplier(title(), "date_night")).toBe(1);
  });

  it("with_friends boosts crowd-pleasers and penalizes slow joyless titles", () => {
    expect(contextMultiplier(title({ comedy_level: 4 }), "with_friends")).toBe(1.2);
    expect(contextMultiplier(title({ pacing: "fast" }), "with_friends")).toBe(1.2);
    expect(contextMultiplier(title({ pacing: "slow", comedy_level: 0 }), "with_friends")).toBe(0.85);
  });

  it("background boosts easy-to-half-watch titles and penalizes demanding ones", () => {
    expect(contextMultiplier(title({ emotional_intensity: 1, dialogue_density: 1 }), "background")).toBe(1.2);
    expect(contextMultiplier(title({ emotional_intensity: 5 }), "background")).toBe(0.8);
  });

  it("something_short excludes anything over the runtime cap, passes the rest", () => {
    expect(contextMultiplier(title({ runtime_minutes: 150 }), "something_short")).toBeNull();
    expect(contextMultiplier(title({ runtime_minutes: 90 }), "something_short")).toBe(1);
    expect(contextMultiplier(title({ runtime_minutes: null }), "something_short")).toBe(1);
  });
});

describe("contextNote", () => {
  it("returns null for solo", () => {
    expect(contextNote(title(), "solo")).toBeNull();
  });

  it("mentions runtime for something_short when known", () => {
    expect(contextNote(title({ runtime_minutes: 87 }), "something_short")).toContain("87");
    expect(contextNote(title({ runtime_minutes: null }), "something_short")).toBeNull();
  });

  it("skips the date_night note for very violent titles", () => {
    expect(contextNote(title({ violence_level: 5 }), "date_night")).toBeNull();
  });
});
