import { describe, expect, it } from "vitest";
import { isSubscriptionStatusActive, resolveStripeCustomerId } from "../subscription-status";

describe("isSubscriptionStatusActive", () => {
  it("treats active and trialing as active", () => {
    expect(isSubscriptionStatusActive("active")).toBe(true);
    expect(isSubscriptionStatusActive("trialing")).toBe(true);
  });

  it("treats every other Stripe status as inactive", () => {
    expect(isSubscriptionStatusActive("past_due")).toBe(false);
    expect(isSubscriptionStatusActive("canceled")).toBe(false);
    expect(isSubscriptionStatusActive("unpaid")).toBe(false);
    expect(isSubscriptionStatusActive("incomplete")).toBe(false);
    expect(isSubscriptionStatusActive("incomplete_expired")).toBe(false);
    expect(isSubscriptionStatusActive("paused")).toBe(false);
  });
});

describe("resolveStripeCustomerId", () => {
  it("returns null for null/undefined", () => {
    expect(resolveStripeCustomerId(null)).toBeNull();
    expect(resolveStripeCustomerId(undefined)).toBeNull();
  });

  it("passes through a plain string id", () => {
    expect(resolveStripeCustomerId("cus_123")).toBe("cus_123");
  });

  it("extracts id from an expanded customer object", () => {
    expect(resolveStripeCustomerId({ id: "cus_456" })).toBe("cus_456");
  });
});
