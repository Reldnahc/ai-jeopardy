import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrace } from "./trace.js";

describe("trace", () => {
  const realNow = Date.now;
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

  beforeEach(() => {
    let t = 1_000;
    Date.now = vi.fn(() => {
      t += 25;
      return t;
    });
    logSpy.mockClear();
    tableSpy.mockClear();
  });

  afterEach(() => {
    Date.now = realNow;
  });

  it("uses provided requestId and records marks with dt", () => {
    const trace = createTrace("test-op", { requestId: "req-123" });
    trace.mark("step-1", { ok: true });
    const out = trace.end({ done: true });

    expect(out.id).toBe("req-123");
    expect(out.total).toBeGreaterThan(0);
    expect(out.marks).toHaveLength(1);
    expect(out.marks[0]).toMatchObject({ name: "step-1", ok: true });
    expect(out.marks[0].dt).toBeGreaterThan(0);
    expect(logSpy).toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalledTimes(1);
  });

  it("skips table output when there are no marks", () => {
    const trace = createTrace("empty-op");
    const out = trace.end();

    expect(out.marks).toHaveLength(0);
    expect(tableSpy).not.toHaveBeenCalled();
  });
});
