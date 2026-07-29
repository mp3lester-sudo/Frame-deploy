import { describe, expect, it } from "vitest";
import { weatherTimeMultiplier, weatherTimeNote, type WeatherableTitle } from "../weather-time-weighting";

function title(overrides: Partial<WeatherableTitle> = {}): WeatherableTitle {
  return {
    mood_tags: [],
    tone: [],
    runtime_minutes: 100,
    ...overrides,
  };
}

const RAIN_CODE = 63; // moderate rain
const CLEAR_CODE = 0;

describe("weatherTimeMultiplier", () => {
  it("boosts comfort-tagged titles on rainy or cold days", () => {
    const cozy = title({ mood_tags: ["heartwarming"] });
    expect(weatherTimeMultiplier(cozy, { weatherCode: RAIN_CODE, tempF: 60, hour: 19 })).toBe(1.15);
    expect(weatherTimeMultiplier(cozy, { weatherCode: CLEAR_CODE, tempF: 30, hour: 19 })).toBe(1.15);
  });

  it("doesn't touch non-comfort titles on rainy days", () => {
    const neutral = title({ mood_tags: ["tense"] });
    expect(weatherTimeMultiplier(neutral, { weatherCode: RAIN_CODE, tempF: 60, hour: 19 })).toBe(1);
  });

  it("boosts light-toned titles and penalizes heavy-toned ones on a warm clear afternoon", () => {
    expect(
      weatherTimeMultiplier(title({ tone: ["uplifting"] }), { weatherCode: CLEAR_CODE, tempF: 80, hour: 14 })
    ).toBe(1.1);
    expect(
      weatherTimeMultiplier(title({ tone: ["dark"] }), { weatherCode: CLEAR_CODE, tempF: 80, hour: 14 })
    ).toBe(0.9);
  });

  it("doesn't apply the warm-day nudge outside daytime hours even if it's warm", () => {
    expect(
      weatherTimeMultiplier(title({ tone: ["uplifting"] }), { weatherCode: CLEAR_CODE, tempF: 80, hour: 23 })
    ).toBe(1);
  });

  it("penalizes very long runtimes late at night", () => {
    expect(
      weatherTimeMultiplier(title({ runtime_minutes: 170 }), { weatherCode: null, tempF: null, hour: 23 })
    ).toBe(0.9);
    expect(
      weatherTimeMultiplier(title({ runtime_minutes: 170 }), { weatherCode: null, tempF: null, hour: 14 })
    ).toBe(1);
  });

  it("is a no-op when there's no weather/time signal to react to", () => {
    expect(weatherTimeMultiplier(title(), { weatherCode: null, tempF: null, hour: 14 })).toBe(1);
  });

  it("compounds multiple applicable nudges", () => {
    // Cold + late night + long runtime: comfort boost applies, late-night runtime penalty applies too.
    const cozyAndLong = title({ mood_tags: ["nostalgic"], runtime_minutes: 170 });
    expect(weatherTimeMultiplier(cozyAndLong, { weatherCode: null, tempF: 30, hour: 23 })).toBeCloseTo(1.15 * 0.9, 5);
  });
});

describe("weatherTimeNote", () => {
  it("explains a rainy-day comfort pick", () => {
    expect(weatherTimeNote(title({ mood_tags: ["warm"] }), { weatherCode: RAIN_CODE, tempF: 60, hour: 19 })).toBe(
      "a comfort watch for the weather outside"
    );
  });

  it("explains a cold-but-clear comfort pick differently from actual rain", () => {
    expect(weatherTimeNote(title({ mood_tags: ["warm"] }), { weatherCode: CLEAR_CODE, tempF: 30, hour: 19 })).toBe(
      "cozy for a cold one"
    );
  });

  it("explains a light pick on a bright day", () => {
    expect(
      weatherTimeNote(title({ tone: ["lighthearted"] }), { weatherCode: CLEAR_CODE, tempF: 80, hour: 14 })
    ).toBe("light enough for a bright day");
  });

  it("returns null when nothing applies", () => {
    expect(weatherTimeNote(title(), { weatherCode: CLEAR_CODE, tempF: 65, hour: 14 })).toBeNull();
  });
});
