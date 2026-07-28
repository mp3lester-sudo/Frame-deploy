import { describe, it, expect } from "vitest";
import { orderPair } from "@/lib/messages/pair";

describe("orderPair", () => {
  it("returns the same order regardless of which id is passed first", () => {
    const a = "11111111-1111-1111-1111-111111111111";
    const b = "22222222-2222-2222-2222-222222222222";
    expect(orderPair(a, b)).toEqual([a, b]);
    expect(orderPair(b, a)).toEqual([a, b]);
  });

  it("throws when given the same id twice (can't DM yourself)", () => {
    const a = "11111111-1111-1111-1111-111111111111";
    expect(() => orderPair(a, a)).toThrow();
  });
});
