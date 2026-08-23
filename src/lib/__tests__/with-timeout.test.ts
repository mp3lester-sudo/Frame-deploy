import { describe, it, expect, vi } from "vitest";
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

  // Recommendation intelligence audit finding #5: degradation used to be
  // completely invisible to the caller -- these three cases are exactly
  // what that finding's fix depends on being reliable.
  it("does not call onDegraded when the promise settles before the timeout", async () => {
    const onDegraded = vi.fn();
    await withTimeout(Promise.resolve("real"), 50, "fallback", onDegraded);
    expect(onDegraded).not.toHaveBeenCalled();
  });

  it("calls onDegraded with 'timeout' when the promise never settles in time", async () => {
    const onDegraded = vi.fn();
    const never = new Promise<string>(() => {});
    await withTimeout(never, 20, "fallback", onDegraded);
    expect(onDegraded).toHaveBeenCalledTimes(1);
    expect(onDegraded).toHaveBeenCalledWith("timeout");
  });

  it("calls onDegraded with 'error' and the rejection reason when the promise rejects", async () => {
    const onDegraded = vi.fn();
    const err = new Error("boom");
    await withTimeout(Promise.reject(err), 50, "fallback", onDegraded);
    expect(onDegraded).toHaveBeenCalledTimes(1);
    expect(onDegraded).toHaveBeenCalledWith("error", err);
  });

  it("only fires onDegraded once even if timeout and rejection race closely", async () => {
    const onDegraded = vi.fn();
    const err = new Error("boom");
    const rejectsSoon = new Promise<string>((_, reject) => setTimeout(() => reject(err), 5));
    await withTimeout(rejectsSoon, 5, "fallback", onDegraded);
    // Whichever of timeout/rejection fires first, only one call should land.
    expect(onDegraded).toHaveBeenCalledTimes(1);
  });
});
