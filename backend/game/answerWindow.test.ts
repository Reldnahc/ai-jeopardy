import { describe, expect, it, vi, afterEach } from "vitest";
import type { GameState } from "../types/runtime.js";
import { clearAnswerWindow, startAnswerWindow } from "./answerWindow.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("answerWindow", () => {
  it("startAnswerWindow sets state and emits start/end", () => {
    vi.useFakeTimers();

    const game = {} as GameState;
    const broadcast = vi.fn();
    const onExpire = vi.fn();

    startAnswerWindow("g1", game, broadcast, 500, onExpire);

    expect(game.answerWindowVersion).toBe(1);
    expect(game.answerWindowMs).toBe(500);
    expect(game.answerDeadlineAt).toBeTypeOf("number");
    expect(broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-window-start", durationMs: 500, answerWindowVersion: 1 }),
    );

    vi.advanceTimersByTime(500);

    expect(onExpire).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: "g1", answerWindowVersion: 1 }),
    );
    expect(game.answerDeadlineAt).toBeNull();
    expect(game.answerWindowMs).toBeNull();
    expect(game.answerWindowVersion).toBeNull();
    expect(broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-window-end", answerWindowVersion: 1 }),
    );
  });

  it("clearAnswerWindow cancels timer and resets fields", () => {
    vi.useFakeTimers();

    const game = {
      answerTimer: setTimeout(() => {}, 1000),
      answerDeadlineAt: Date.now() + 1000,
      answerWindowMs: 1000,
      answerWindowVersion: 2,
    } as unknown as GameState;

    clearAnswerWindow(game);

    expect(game.answerTimer).toBeNull();
    expect(game.answerDeadlineAt).toBeNull();
    expect(game.answerWindowMs).toBeNull();
    expect(game.answerWindowVersion).toBeNull();
  });
});
