import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import { createCtx, fireAndForget } from "../../test/createCtx.js";
import { finalizeDailyDoubleWagerAndStartClue } from "./finalize.js";

function buildGame(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "DD_WAGER_CAPTURE",
    players: [{ username: "alice", displayname: "Alice", online: true }],
    scores: { alice: 1200 },
    selectedClue: { value: 400, question: "Q", answer: "A" },
    boardData: { ttsByClueKey: { "firstBoard:400:Q": "asset-1" } },
    clueState: { clueKey: "firstBoard:400:Q" },
    clearedClues: new Set<string>(),
    dailyDouble: {
      clueKey: "firstBoard:400:Q",
      boardKey: "firstBoard",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      stage: "wager_listen",
      wager: null,
      maxWager: 1200,
      attempts: 0,
    },
    ...overrides,
  };
}

function buildCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  let timeoutCb: (() => void) | null = null;
  const ctx = createCtx(
    {
      games: { g1: game },
      repos: {
        profiles: {
          incrementTrueDailyDoubles: vi.fn(async () => {}),
        },
      },
      fireAndForget,
      broadcast: vi.fn(),
      clearDdWagerTimer: vi.fn(),
      aiHostVoiceSequence: vi.fn(async () => true),
      clearAnswerWindow: vi.fn(),
      startGameTimer: vi.fn(),
      startAnswerWindow: vi.fn((_gid, _g, _broadcast, _ms, cb: () => void) => {
        timeoutCb = cb;
      }),
      parseClueValue: vi.fn(() => 400),
      autoResolveAfterJudgement: vi.fn(async () => {}),
      ...overrides,
    },
    overrides,
  );

  return { ctx, getTimeoutCb: () => timeoutCb };
}

describe("dailyDouble finalize", () => {
  it("no-ops when daily double state is missing", async () => {
    const game = buildGame({ dailyDouble: undefined });
    const { ctx } = buildCtx(game);

    await finalizeDailyDoubleWagerAndStartClue("g1", game, ctx, { wager: 500 });

    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("locks wager, marks DD used, announces clue, and starts answer capture", async () => {
    const game = buildGame({ timeToAnswer: 5 });
    const { ctx } = buildCtx(game);

    await finalizeDailyDoubleWagerAndStartClue("g1", game, ctx, { wager: 1200, fallback: true, reason: "timeout" });

    expect(game.dailyDouble?.wager).toBe(1200);
    expect(game.dailyDouble?.stage).toBe("clue");
    expect(game.usedDailyDoubles?.has("firstBoard:400:Q")).toBe(true);
    expect(game.phase).toBe("ANSWER_CAPTURE");
    expect(ctx.repos.profiles.incrementTrueDailyDoubles).toHaveBeenCalledWith("alice");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "daily-double-wager-locked", wager: 1200, fallback: true, reason: "timeout" }),
    );
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", expect.objectContaining({ type: "clue-selected" }));
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", expect.objectContaining({ type: "answer-capture-start" }));
    expect(ctx.startGameTimer).toHaveBeenCalledWith("g1", game, ctx, 5, "answer");
  });

  it("answer timeout callback resolves incorrect with DD wager value", async () => {
    const game = buildGame();
    const { ctx, getTimeoutCb } = buildCtx(game);

    await finalizeDailyDoubleWagerAndStartClue("g1", game, ctx, { wager: 700 });
    const cb = getTimeoutCb();
    expect(typeof cb).toBe("function");
    cb?.();

    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-result", verdict: "incorrect", suggestedDelta: -700 }),
    );
    expect(ctx.autoResolveAfterJudgement).toHaveBeenCalledWith(ctx, "g1", game, undefined, "incorrect");
  });

  it("falls back to default answer timer when configured time is non-positive", async () => {
    const game = buildGame({ timeToAnswer: 0 });
    const { ctx } = buildCtx(game);

    await finalizeDailyDoubleWagerAndStartClue("g1", game, ctx, { wager: 500 });

    expect(ctx.startGameTimer).toHaveBeenCalledWith("g1", game, ctx, 9, "answer");
  });

  it("timeout callback uses clue value when DD wager is not active and respects early returns", async () => {
    const game = buildGame();
    const { ctx, getTimeoutCb } = buildCtx(game, { parseClueValue: vi.fn(() => 600) });

    await finalizeDailyDoubleWagerAndStartClue("g1", game, ctx, { wager: 700 });
    const cb = getTimeoutCb();
    expect(typeof cb).toBe("function");

    game.dailyDouble = {
      ...game.dailyDouble!,
      clueKey: "other-clue",
      wager: Number.NaN,
    };
    cb?.();

    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-result", verdict: "incorrect", suggestedDelta: -600 }),
    );

    const callsBefore = (ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length;
    game.answerSessionId = null;
    cb?.();
    expect((ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it("handles null args, zero wager, existing used set, and missing tts asset fallback", async () => {
    const game = buildGame({
      usedDailyDoubles: new Set(["already-used"]),
      boardData: { ttsByClueKey: {} },
    });
    const { ctx } = buildCtx(game);

    await finalizeDailyDoubleWagerAndStartClue("g1", game, ctx, null);
    expect(game.dailyDouble?.wager).toBe(0);
    expect(game.usedDailyDoubles?.has("already-used")).toBe(true);
    expect(game.usedDailyDoubles?.has("firstBoard:400:Q")).toBe(true);
    expect(ctx.repos.profiles.incrementTrueDailyDoubles).not.toHaveBeenCalled();
    expect(ctx.aiHostVoiceSequence).toHaveBeenCalledWith(
      ctx,
      "g1",
      game,
      expect.arrayContaining([expect.objectContaining({ assetId: null })]),
    );
  });

  it("timeout callback covers guard-return branches and logs auto-resolve failures", async () => {
    const game = buildGame();
    const autoResolveAfterJudgement = vi.fn(async () => {
      throw new Error("boom");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx, getTimeoutCb } = buildCtx(game, { autoResolveAfterJudgement });

    await finalizeDailyDoubleWagerAndStartClue("g1", game, ctx, { wager: 600 });
    const cb = getTimeoutCb();
    expect(cb).toBeTypeOf("function");

    const callsBefore = (ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length;
    if (ctx.games) {
      const sessionId = game.answerSessionId;
      const answeringKey = game.answeringPlayerKey;

      delete ctx.games.g1; // !g
      cb?.();
      expect((ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);

      ctx.games.g1 = { ...game, answerSessionId: null } as never; // !g.answerSessionId
      cb?.();
      expect((ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);

      ctx.games.g1 = { ...game, answerSessionId: `${sessionId}-other` } as never; // mismatched session
      cb?.();
      expect((ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);

      ctx.games.g1 = {
        ...game,
        answerSessionId: sessionId,
        answeringPlayerKey: `${answeringKey}-other`,
      } as never; // mismatched answering player
      cb?.();
      expect((ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);

      ctx.games.g1 = {
        ...game,
        answerSessionId: sessionId,
        answeringPlayerKey: answeringKey,
        selectedClue: null,
      } as never; // missing selected clue
      cb?.();
      expect((ctx.broadcast as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);

      ctx.games.g1 = game as never; // valid state
    }

    cb?.();
    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalledWith("[dd-answer-timeout] autoResolve failed:", expect.any(Error));
  });
});
