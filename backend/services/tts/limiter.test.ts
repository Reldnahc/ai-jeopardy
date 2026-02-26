import { describe, expect, it, vi } from "vitest";

describe("tts limiter", () => {
  it("returns the same limiter instance per provider", async () => {
    vi.resetModules();
    const { getLimiter } = await import("./limiter.js");

    const a = getLimiter("openai");
    const b = getLimiter("openai");
    const c = getLimiter("kokoro");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("enforces sequential execution when concurrency is set to 1", async () => {
    vi.resetModules();
    process.env.TTS_OPENAI_CONCURRENCY = "1";
    process.env.TTS_OPENAI_MIN_DELAY_MS = "0";

    const { getLimiter } = await import("./limiter.js");
    const limiter = getLimiter("openai");

    let firstRelease: (() => void) | null = null;
    const order: string[] = [];

    const first = limiter.schedule(
      () =>
        new Promise<string>((resolve) => {
          order.push("first-start");
          firstRelease = () => {
            order.push("first-end");
            resolve("first");
          };
        }),
    );

    const second = limiter.schedule(async () => {
      order.push("second-start");
      return "second";
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    firstRelease?.();
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("propagates job errors", async () => {
    vi.resetModules();
    const { getLimiter } = await import("./limiter.js");
    const limiter = getLimiter("kokoro");

    await expect(
      limiter.schedule(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
