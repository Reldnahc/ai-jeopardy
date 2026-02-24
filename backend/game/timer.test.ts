import { describe, expect, it, vi, afterEach } from "vitest";
import type { GameState } from "../types/runtime.js";
import { createCtx } from "../test/createCtx.js";
import { clearGameTimer, startGameTimer } from "./timer.js";

afterEach(() => {
  vi.useRealTimers();
});

function buildCtx() {
  return createCtx({
    broadcast: vi.fn(),
  });
}

describe("timer", () => {
  it("no-ops when game is missing", () => {
    const ctx = buildCtx();
    const onExpire = vi.fn();

    startGameTimer("g1", null, ctx, 2, "buzz", onExpire);
    clearGameTimer(undefined, "g1", ctx);

    expect(ctx.broadcast).not.toHaveBeenCalled();
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("startGameTimer sets timer state and expires with callback", () => {
    vi.useFakeTimers();

    const game = { timerVersion: 0 } as GameState;
    const ctx = buildCtx();
    const onExpire = vi.fn();

    startGameTimer("g1", game, ctx, 2, "buzz", onExpire);

    expect(game.timerVersion).toBe(1);
    expect(game.timerKind).toBe("buzz");
    expect(game.timerDuration).toBe(2);
    expect(game.timerEndTime).toBeTypeOf("number");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "timer-start", duration: 2, timerVersion: 1, timerKind: "buzz" }),
    );

    vi.advanceTimersByTime(2000);

    expect(onExpire).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: "g1", timerVersion: 1, timerKind: "buzz" }),
    );
    expect(game.timerKind).toBeNull();
    expect(game.timerDuration).toBeNull();
    expect(game.timerEndTime).toBeNull();
  });

  it("clearGameTimer broadcasts end and clears fields", () => {
    vi.useFakeTimers();

    const game = {
      timerVersion: 3,
      timerKind: "answer",
      timerDuration: 5,
      timerEndTime: Date.now() + 5000,
      timerTimeout: setTimeout(() => {}, 5000),
    } as unknown as GameState;
    const ctx = buildCtx();

    clearGameTimer(game, "g1", ctx);

    expect(game.timerTimeout).toBeNull();
    expect(game.timerKind).toBeNull();
    expect(game.timerDuration).toBeNull();
    expect(game.timerEndTime).toBeNull();
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "timer-end", timerVersion: 3, timerKind: "answer" }),
    );
  });

  it("ignores stale timer callback after restart", () => {
    vi.useFakeTimers();

    const game = { timerVersion: 0 } as GameState;
    const ctx = buildCtx();
    const onExpire = vi.fn();

    startGameTimer("g1", game, ctx, 1, "buzz", onExpire);
    startGameTimer("g1", game, ctx, 2, "answer", onExpire);
    expect(game.timerVersion).toBe(2);

    vi.advanceTimersByTime(1000);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: "g1", timerVersion: 2, timerKind: "answer" }),
    );
  });
});
