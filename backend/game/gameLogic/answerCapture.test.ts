import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import { createCtx } from "../../test/createCtx.js";
import { handleAnswerCaptureTimeout, startAnswerCapture } from "./answerCapture.js";

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    selectedClue: { value: 400, question: "Q", answer: "A" },
    clueState: { clueKey: "firstBoard:400:Q" },
    timeToAnswer: 5,
    ...overrides,
  };
}

function makeCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  let timeoutCb: (() => void) | null = null;
  const ctx = createCtx(
    {
      games: { g1: game },
      broadcast: vi.fn(),
      clearAnswerWindow: vi.fn(),
      startGameTimer: vi.fn(),
      startAnswerWindow: vi.fn((_gid, _game, _broadcast, _ms, cb: () => void) => {
        timeoutCb = cb;
      }),
      autoResolveAfterJudgement: vi.fn(async () => {}),
      ...overrides,
    },
    overrides,
  );

  return { ctx, getTimeoutCb: () => timeoutCb };
}

describe("answerCapture helpers", () => {
  it("starts answer capture and schedules timeout handling", () => {
    const game = makeGame();
    const { ctx, getTimeoutCb } = makeCtx(game);

    startAnswerCapture({
      ctx,
      gameId: "g1",
      game,
      playerUsername: "alice",
      playerDisplayname: "Alice",
      clueKey: "firstBoard:400:Q",
    });

    expect(game.phase).toBe("ANSWER_CAPTURE");
    expect(game.answeringPlayerUsername).toBe("alice");
    expect(game.answeringPlayerKey).toBe("alice");
    expect(game.answerClueKey).toBe("firstBoard:400:Q");
    expect(typeof game.answerSessionId).toBe("string");
    expect(ctx.clearAnswerWindow).toHaveBeenCalledWith(game);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-capture-start", username: "alice", durationMs: 5000 }),
    );
    expect(ctx.startGameTimer).toHaveBeenCalledWith("g1", game, ctx, 5, "answer");
    expect(getTimeoutCb()).toBeTypeOf("function");
  });

  it("uses default answer duration when configured value is non-positive", () => {
    const game = makeGame({ timeToAnswer: 0 });
    const { ctx } = makeCtx(game);

    startAnswerCapture({
      ctx,
      gameId: "g1",
      game,
      playerUsername: "alice",
      playerDisplayname: "Alice",
      clueKey: "firstBoard:400:Q",
    });

    expect(ctx.startGameTimer).toHaveBeenCalledWith("g1", game, ctx, 9, "answer");
  });

  it("emits incorrect result and auto-resolves on timeout", async () => {
    const game = makeGame({
      answerSessionId: "sess-1",
      answeringPlayerKey: "alice",
    });
    const { ctx } = makeCtx(game);

    handleAnswerCaptureTimeout({
      ctx,
      gameId: "g1",
      sourceGame: game,
      answerSessionId: "sess-1",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      answeringPlayerKey: "alice",
    });

    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-result", verdict: "incorrect", suggestedDelta: -400 }),
    );
    await Promise.resolve();
    expect(ctx.autoResolveAfterJudgement).toHaveBeenCalledWith(ctx, "g1", game, "alice", "incorrect");
  });

  it("uses active daily double wager for timeout penalty", () => {
    const game = makeGame({
      answerSessionId: "sess-1",
      answeringPlayerKey: "alice",
      dailyDouble: {
        clueKey: "firstBoard:400:Q",
        playerUsername: "alice",
        playerDisplayname: "Alice",
        wager: 1200,
      },
    });
    const { ctx } = makeCtx(game);

    handleAnswerCaptureTimeout({
      ctx,
      gameId: "g1",
      sourceGame: game,
      answerSessionId: "sess-1",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      answeringPlayerKey: "alice",
    });

    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-result", verdict: "incorrect", suggestedDelta: -1200 }),
    );
  });

  it("guards against stale timeout callbacks and reports auto-resolve failures", async () => {
    const game = makeGame({
      answerSessionId: "sess-1",
      answeringPlayerKey: "alice",
    });
    const onAutoResolveError = vi.fn();
    const autoResolveAfterJudgement = vi.fn(async () => {
      throw new Error("boom");
    });
    const { ctx } = makeCtx(game, { autoResolveAfterJudgement });
    const callsBefore = (ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length;

    handleAnswerCaptureTimeout({
      ctx,
      gameId: "g1",
      sourceGame: game,
      answerSessionId: "other",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      answeringPlayerKey: "alice",
      onAutoResolveError,
    });
    expect((ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);

    handleAnswerCaptureTimeout({
      ctx,
      gameId: "g1",
      sourceGame: game,
      answerSessionId: "sess-1",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      answeringPlayerKey: "alice",
      onAutoResolveError,
    });
    await Promise.resolve();
    expect(onAutoResolveError).toHaveBeenCalledWith(expect.any(Error));
  });
});
