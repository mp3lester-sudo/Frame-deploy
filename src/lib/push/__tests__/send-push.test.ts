import { describe, expect, it } from "vitest";
import { isPermanentlyInvalidSubscription } from "../send-push";

describe("isPermanentlyInvalidSubscription", () => {
  it("treats 404 and 410 as permanently invalid", () => {
    expect(isPermanentlyInvalidSubscription(404)).toBe(true);
    expect(isPermanentlyInvalidSubscription(410)).toBe(true);
  });

  it("treats every other status (or none) as potentially transient", () => {
    expect(isPermanentlyInvalidSubscription(500)).toBe(false);
    expect(isPermanentlyInvalidSubscription(429)).toBe(false);
    expect(isPermanentlyInvalidSubscription(400)).toBe(false);
    expect(isPermanentlyInvalidSubscription(undefined)).toBe(false);
  });
});
