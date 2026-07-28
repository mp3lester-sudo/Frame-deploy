import { describe, expect, it } from "vitest";
import { detectAutoContext, isCircumstantialContext } from "../circumstantial";

describe("detectAutoContext", () => {
  it("defaults to background late at night regardless of day", () => {
    expect(detectAutoContext({ hour: 0, dayOfWeek: 3 })).toBe("background");
    expect(detectAutoContext({ hour: 23, dayOfWeek: 5 })).toBe("background");
    expect(detectAutoContext({ hour: 4, dayOfWeek: 6 })).toBe("background");
  });

  it("defaults to with_friends on Friday/Saturday prime evening", () => {
    expect(detectAutoContext({ hour: 19, dayOfWeek: 5 })).toBe("with_friends");
    expect(detectAutoContext({ hour: 20, dayOfWeek: 6 })).toBe("with_friends");
  });

  it("defaults to solo on a weeknight evening", () => {
    expect(detectAutoContext({ hour: 20, dayOfWeek: 2 })).toBe("solo");
  });

  it("defaults to solo on a Sunday evening (not prime Fri/Sat)", () => {
    expect(detectAutoContext({ hour: 20, dayOfWeek: 0 })).toBe("solo");
  });

  it("switches to background when the weather is rough during the day", () => {
    expect(detectAutoContext({ hour: 14, dayOfWeek: 5, weatherCode: 63 })).toBe("background");
    expect(detectAutoContext({ hour: 15, dayOfWeek: 6, weatherCode: 95 })).toBe("background");
  });

  it("ignores rough weather before noon", () => {
    expect(detectAutoContext({ hour: 8, dayOfWeek: 2, weatherCode: 63 })).toBe("solo");
  });

  it("ignores clear weather codes", () => {
    expect(detectAutoContext({ hour: 14, dayOfWeek: 5, weatherCode: 0 })).toBe("solo");
  });
});

describe("isCircumstantialContext", () => {
  it("accepts valid context strings", () => {
    expect(isCircumstantialContext("solo")).toBe(true);
    expect(isCircumstantialContext("date_night")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCircumstantialContext("party")).toBe(false);
    expect(isCircumstantialContext("")).toBe(false);
  });
});
