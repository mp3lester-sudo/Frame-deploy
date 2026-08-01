import { describe, expect, it } from "vitest";
import { isCircumstantialContext } from "../circumstantial";

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
