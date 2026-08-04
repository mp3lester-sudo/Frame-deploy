import { describe, expect, it } from "vitest";
import { generateReferralCode } from "../code";

describe("generateReferralCode", () => {
  it("generates a 7-character code", () => {
    expect(generateReferralCode()).toHaveLength(7);
  });

  it("only uses the unambiguous alphabet (no 0/O/1/I/l)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
    }
  });

  it("produces different codes across calls (extremely unlikely to collide)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateReferralCode()));
    expect(codes.size).toBe(20);
  });
});
