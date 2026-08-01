import { describe, it, expect } from "vitest";
import { withTimeout } from "@/lib/with-timeout";

describe("withTimeout", () => {
  it("resolves with the promise's value when it settles before the timeout", async () => {
    const result = await withTimeout(Promise.resolve("real"), 50, "fallback");
    expect(result).toBe("real");
  });

  it("resolves with the fallback when the promise never settles in time", async () => {
    const never = new Promise<string>(() => {});
    const result = await withTimeout(never, 20, "fallback");
    expect(result).toBe("fallback");
  });

  it("resolves with the fallback when the promise rejects", async () => {
    const result = await withTimeout(Promise.reject(new Error("boom")), 50, "fallback");
    expect(result).toBe("fallback");
  });
});
