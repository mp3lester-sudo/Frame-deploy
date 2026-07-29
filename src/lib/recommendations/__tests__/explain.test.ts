import { describe, expect, it } from "vitest";
import { buildReasonDetail, type ExplainableTitle } from "../explain";

function title(overrides: Partial<ExplainableTitle> = {}): ExplainableTitle {
  return {
    runtime_minutes: 110,
    violence_level: 1,
    comedy_level: 1,
    emotional_intensity: 2,
    dialogue_density: 2,
    pacing: "moderate",
    themes: ["betrayal", "redemption"],
    tone: ["dark", "tense"],
    mood_tags: ["gritty", "suspenseful"],
    ending_type: "bittersweet",
    ...overrides,
  };
}

describe("buildReasonDetail", () => {
  it("cites the source title and its traits when there's a strong content match with a citation", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      hasCollaborativeEdge: false,
      citedTitle: "Se7en",
    });
    expect(detail.headline).toContain("Se7en");
    expect(detail.headline).toContain("betrayal");
    expect(detail.citedTitle).toBe("Se7en");
  });

  it("falls back to a generic content-match line when there's no citation", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      hasCollaborativeEdge: false,
      citedTitle: null,
    });
    expect(detail.headline).toContain("Matches your taste closely");
  });

  it("uses the collaborative line when there's no content match but a collaborative edge", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: false,
      hasCollaborativeEdge: true,
      citedTitle: null,
    });
    expect(detail.headline).toContain("Loved by people");
  });

  it("falls back to mood tags when neither content nor collaborative signal is present", () => {
    const detail = buildReasonDetail({
      title: title({ mood_tags: ["cozy", "nostalgic"] }),
      hasStrongContentMatch: false,
      hasCollaborativeEdge: false,
      citedTitle: null,
    });
    expect(detail.headline).toContain("cozy");
  });

  it("falls back to a generic Taste Graph line with no signal at all", () => {
    const detail = buildReasonDetail({
      title: title({ mood_tags: [] }),
      hasStrongContentMatch: false,
      hasCollaborativeEdge: false,
      citedTitle: null,
    });
    expect(detail.headline).toContain("Taste Graph");
  });

  it("appends a context note in parens when a context is supplied", () => {
    const detail = buildReasonDetail({
      title: title({ runtime_minutes: 87 }),
      hasStrongContentMatch: false,
      hasCollaborativeEdge: false,
      citedTitle: null,
      context: "something_short",
    });
    expect(detail.headline).toContain("87 minutes");
  });

  it("always surfaces the full theme/tone/mood/pacing/ending detail regardless of headline branch", () => {
    const detail = buildReasonDetail({
      title: title(),
      hasStrongContentMatch: true,
      hasCollaborativeEdge: false,
      citedTitle: "Se7en",
    });
    expect(detail.themes).toEqual(["betrayal", "redemption"]);
    expect(detail.tone).toEqual(["dark", "tense"]);
    expect(detail.moodTags).toEqual(["gritty", "suspenseful"]);
    expect(detail.pacing).toBe("moderate");
    expect(detail.endingType).toBe("bittersweet");
  });
});
