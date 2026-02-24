import { describe, expect, it, vi, afterEach } from "vitest";
import type { GameState } from "../../types/runtime.js";
import { createCtx, fireAndForget } from "../../test/createCtx.js";
import { clearDdWagerTimer, repromptDdWager, startDdWagerCapture } from "./capture.js";
import { finalizeDailyDoubleWagerAndStartClue } from "./finalize.js";

vi.mock("./finalize.js", () => ({
  finalizeDailyDoubleWagerAndStartClue: vi.fn(async () => {}),
}));

afterEach(() => {
  vi.useRealTimers();
});

function buildGame(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "clue",
    ddWagerSessionId: null,
    ddWagerDeadlineAt: null,
    players: [{ username: "alice", displayname: "Alice", online: true }],
    scores: { alice: 1200 },
    boardData: { ttsByClueKey: {}, ttsByAnswerKey: {} },
    selectedClue: { value: 400, question: "Q", answer: "A" },
    clueState: { clueKey: "firstBoard:400:Q" },
    dailyDouble: {
      clueKey: "firstBoard:400:Q",
      boardKey: "firstBoard",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      stage: "wager",
      maxWager: 1200,
      attempts: 0,
      wager: null,
    },
    ...overrides,
  };
}

function buildCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: { g1: game },
      repos: { profiles: { incrementTrueDailyDoubles: vi.fn(async () => {}) } },
      broadcast: vi.fn(),
      startGameTimer: vi.fn(),
      clearDdWagerTimer: vi.fn(),
      clearAnswerWindow: vi.fn(),
      startAnswerWindow: vi.fn(),
      aiHostVoiceSequence: vi.fn(async () => true),
      parseClueValue: vi.fn(() => 400),
      autoResolveAfterJudgement: vi.fn(async () => {}),
      clearGameTimer: vi.fn(),
      getClueKey: vi.fn(() => "firstBoard:400:Q"),
      doUnlockBuzzerAuthoritative: vi.fn(),
      sleep: vi.fn(async () => {}),
      sleepAndCheckGame: vi.fn(async () => true),
      checkBoardTransition: vi.fn(() => false),
      checkAllWagersSubmitted: vi.fn(),
      isBoardFullyCleared: vi.fn(() => false),
      getTtsDurationMs: vi.fn(async () => 0),
      fireAndForget,
    },
    overrides,
  );
}

describe("dailyDouble capture", () => {
  it("clearDdWagerTimer clears timeout and broadcasts timer-end with current version", () => {
    vi.useFakeTimers();
    const game = buildGame({
      _ddWagerTimer: setTimeout(() => {}, 1000),
    });
    const ctx = buildCtx(game);
    ctx.games.g1.timerVersion = 4;

    clearDdWagerTimer(ctx, "g1", game);

    expect(game._ddWagerTimer).toBeNull();
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "timer-end", timerVersion: 4 });
  });

  it("reprompt broadcasts parse-failed and restarts capture when attempts remain", async () => {
    const game = buildGame({ dailyDouble: { ...buildGame().dailyDouble, attempts: 1 } as GameState["dailyDouble"] });
    const ctx = buildCtx(game);
    const oldSession = game.ddWagerSessionId;

    await repromptDdWager("g1", game, ctx, { reason: "timeout" });

    expect(game.dailyDouble?.attempts).toBe(2);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "daily-double-wager-parse-failed", reason: "timeout" }),
    );
    expect(game.phase).toBe("DD_WAGER_CAPTURE");
    expect(game.ddWagerSessionId).toBeTruthy();
    expect(game.ddWagerSessionId).not.toBe(oldSession);
    expect(ctx.startGameTimer).toHaveBeenCalledWith("g1", game, ctx, 10, "wager");
  });

  it("reprompt falls back to zero and finalizes after max attempts", async () => {
    const dd = {
      clueKey: "firstBoard:400:Q",
      boardKey: "firstBoard",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      stage: "wager",
      maxWager: 1200,
      attempts: 10,
      wager: null,
    } as GameState["dailyDouble"];
    const game = buildGame({ dailyDouble: dd });
    const ctx = buildCtx(game);

    await repromptDdWager("g1", game, ctx, { reason: "timeout" });

    expect(game.dailyDouble?.wager).toBe(0);
    expect(game.dailyDouble?.stage).toBe("clue");
    expect(game.phase).toBe("clue");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "daily-double-wager-locked", wager: 0, fallback: true }),
    );
    expect(finalizeDailyDoubleWagerAndStartClue).toHaveBeenCalledWith("g1", game, ctx, {
      fallbackWager: 0,
      fallback: false,
      reason: null,
    });
  });

  it("timer expiry triggers reprompt path for missing wager", async () => {
    vi.useFakeTimers();
    const game = buildGame();
    const ctx = buildCtx(game);

    startDdWagerCapture("g1", game, ctx);

    await vi.advanceTimersByTimeAsync(10260);

    expect(game.dailyDouble?.attempts).toBe(1);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "daily-double-wager-parse-failed" }),
    );
  });
});
