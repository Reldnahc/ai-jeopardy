import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import { createCtx, fireAndForget } from "../../test/createCtx.js";
import {
  computeDailyDoubleMaxWager,
  finalizeDailyDoubleWagerAndStartClue,
  startDdWagerCapture,
} from "./dailyDouble.js";

type ProfileFns = {
  incrementTrueDailyDoubles: ReturnType<typeof vi.fn>;
};

function buildGame(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [{ username: "alice", displayname: "Alice", online: true }],
    scores: { alice: 1200 },
    boardData: {
      firstBoard: {
        categories: [{ values: [{ value: 200 }, { value: 400 }, { value: 600 }] }],
      },
      secondBoard: {
        categories: [{ values: [{ value: 400 }, { value: 800 }, { value: 1200 }] }],
      },
      ttsByClueKey: { "firstBoard:400:Test clue": "asset-1" },
    },
    selectedClue: { value: 400, question: "Test clue", answer: "What is test?" },
    clearedClues: new Set<string>(),
    phase: "clue",
    clueState: { clueKey: "firstBoard:400:Test clue" },
    answeringPlayerKey: "alice",
    dailyDouble: {
      clueKey: "firstBoard:400:Test clue",
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

function buildCtx(game: GameState) {
  const profiles: ProfileFns = {
    incrementTrueDailyDoubles: vi.fn(async () => {}),
  };

  const ctx = createCtx({
    games: { g1: game },
    repos: { profiles },
    broadcast: vi.fn(),
    startGameTimer: vi.fn(),
    clearDdWagerTimer: vi.fn(),
    clearAnswerWindow: vi.fn(),
    startAnswerWindow: vi.fn(),
    aiHostVoiceSequence: vi.fn(async () => true),
    parseClueValue: vi.fn((v: unknown) => Number(String(v ?? 0).replace(/[^0-9]/g, "")) || 0),
    autoResolveAfterJudgement: vi.fn(async () => {}),
    fireAndForget,
  });

  return { ctx, profiles };
}

describe("dailyDouble", () => {
  it("computeDailyDoubleMaxWager uses board max when score is lower/negative", () => {
    const game = buildGame({ scores: { alice: -500 } });
    expect(computeDailyDoubleMaxWager(game, "firstBoard", "alice")).toBe(600);
  });

  it("computeDailyDoubleMaxWager uses player score when score is higher than board max", () => {
    const game = buildGame({ scores: { alice: 5000 } });
    expect(computeDailyDoubleMaxWager(game, "firstBoard", "alice")).toBe(5000);
  });

  it("startDdWagerCapture sets DD capture state and broadcasts start", () => {
    const game = buildGame();
    const { ctx } = buildCtx(game);

    startDdWagerCapture("g1", game, ctx);

    expect(game.phase).toBe("DD_WAGER_CAPTURE");
    expect(game.ddWagerSessionId).toBeTruthy();
    expect(game.ddWagerDeadlineAt).toBeTypeOf("number");
    expect(game.dailyDouble?.stage).toBe("wager_listen");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "daily-double-wager-capture-start", username: "alice" }),
    );
    expect(ctx.startGameTimer).toHaveBeenCalledWith("g1", game, ctx, 10, "wager");
  });

  it("finalizeDailyDoubleWagerAndStartClue locks wager, marks used DD, and starts answer capture", async () => {
    const game = buildGame();
    const { ctx } = buildCtx(game);

    await finalizeDailyDoubleWagerAndStartClue("g1", game, ctx, { wager: 700 });

    expect(game.dailyDouble?.wager).toBe(700);
    expect(game.dailyDouble?.stage).toBe("clue");
    expect(game.phase).toBe("ANSWER_CAPTURE");
    expect(game.usedDailyDoubles?.has("firstBoard:400:Test clue")).toBe(true);
    expect(game.answeringPlayerUsername).toBe("alice");
    expect(game.answerSessionId).toBeTruthy();
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "daily-double-wager-locked", wager: 700 }),
    );
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-capture-start", username: "alice" }),
    );
    expect(ctx.startAnswerWindow).toHaveBeenCalled();
  });

  it("records true daily double stat when wager equals maxWager", async () => {
    const game = buildGame({
      dailyDouble: {
        clueKey: "firstBoard:400:Test clue",
        boardKey: "firstBoard",
        playerUsername: "alice",
        playerDisplayname: "Alice",
        stage: "wager",
        maxWager: 1200,
        attempts: 0,
        wager: null,
      },
    });
    const { ctx, profiles } = buildCtx(game);

    await finalizeDailyDoubleWagerAndStartClue("g1", game, ctx, { wager: 1200 });

    expect(profiles.incrementTrueDailyDoubles).toHaveBeenCalledWith("alice");
  });
});
