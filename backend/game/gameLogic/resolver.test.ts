import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import { createCtx, fireAndForget } from "../../test/createCtx.js";
import { autoResolveAfterJudgement } from "./resolver.js";
import { finishClueAndReturnToBoard } from "./boardFlow.js";

vi.mock("./boardFlow.js", () => ({
  finishClueAndReturnToBoard: vi.fn(),
}));

function makeCtx(overrides: Record<string, unknown> = {}) {
  const profiles = {
    incrementCorrectAnswers: vi.fn(async () => {}),
    incrementDailyDoubleCorrect: vi.fn(async () => {}),
    incrementWrongAnswers: vi.fn(async () => {}),
  };

  return {
    ctx: createCtx(
      {
        repos: { profiles },
        broadcast: vi.fn(),
        fireAndForget,
        aiHostVoiceSequence: vi.fn(
          async (_ctx, _gameId, _game, steps: Array<{ after?: () => unknown }>) => {
            for (const step of steps) {
              if (typeof step?.after === "function") {
                await step.after();
              }
            }
            return true;
          },
        ),
        sleep: vi.fn(async () => {}),
        clearAnswerWindow: vi.fn(),
        clearGameTimer: vi.fn(),
        doUnlockBuzzerAuthoritative: vi.fn(),
        getClueKey: vi.fn(() => "firstBoard:400:Q"),
        startGameTimer: vi.fn(),
        sleepAndCheckGame: vi.fn(async () => true),
        checkBoardTransition: vi.fn(() => false),
        checkAllWagersSubmitted: vi.fn(),
        isBoardFullyCleared: vi.fn(() => false),
        getTtsDurationMs: vi.fn(async () => 0),
      },
      overrides,
    ),
    profiles,
  };
}

describe("resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("incorrect with players left locks out user and re-opens buzz", async () => {
    const game = {
      players: [{ username: "alice" }, { username: "bob" }],
      scores: { alice: 1000, bob: 1000 },
      selectedClue: { value: "$400", question: "Q", answer: "A", isAnswerRevealed: false },
      clueState: { clueKey: "firstBoard:400:Q", lockedOut: {} },
      buzzed: "alice",
      answeringPlayerKey: "alice",
      answerSessionId: "s1",
    } as unknown as GameState;
    const { ctx } = makeCtx();

    await autoResolveAfterJudgement(ctx, "g1", game, "alice", "incorrect");

    expect(game.clueState?.lockedOut?.alice).toBe(true);
    expect(game.answeringPlayerKey).toBeNull();
    expect(game.answerSessionId).toBeNull();
    expect(ctx.clearAnswerWindow).toHaveBeenCalledWith(game);
    expect(ctx.clearGameTimer).toHaveBeenCalledWith(game, "g1", ctx);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "buzzer-ui-reset" });
    expect(ctx.doUnlockBuzzerAuthoritative).toHaveBeenCalledWith("g1", game, ctx);
    expect(finishClueAndReturnToBoard).not.toHaveBeenCalled();
  });

  it("incorrect with no players left reveals answer and finishes clue", async () => {
    const game = {
      players: [{ username: "alice" }],
      scores: { alice: 1000 },
      selectedClue: { value: "$400", question: "Q", answer: "A", isAnswerRevealed: false },
      clueState: { clueKey: "firstBoard:400:Q", lockedOut: {} },
      boardData: { ttsByAnswerKey: { "firstBoard:400:Q": "asset-1" } },
      answeringPlayerKey: "alice",
    } as unknown as GameState;
    const { ctx } = makeCtx();

    await autoResolveAfterJudgement(ctx, "g1", game, "alice", "incorrect");

    expect(game.selectedClue?.isAnswerRevealed).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-revealed" }),
    );
    expect(finishClueAndReturnToBoard).toHaveBeenCalledWith(ctx, "g1", game);
  });

  it("correct exits early when voice sequence reports game is not alive", async () => {
    const game = {
      players: [{ username: "alice", displayname: "Alice" }],
      scores: { alice: 0 },
      selectedClue: { value: "$400", question: "Q", answer: "A", isAnswerRevealed: false },
      clueState: { clueKey: "firstBoard:400:Q", lockedOut: {} },
    } as unknown as GameState;
    const { ctx } = makeCtx({ aiHostVoiceSequence: vi.fn(async () => false) });

    await autoResolveAfterJudgement(ctx, "g1", game, "alice", "correct");

    expect(game.selectorKey).toBeUndefined();
    expect(finishClueAndReturnToBoard).not.toHaveBeenCalled();
  });

  it("incorrect on active daily double reveals answer and clears DD", async () => {
    const game = {
      players: [{ username: "alice" }],
      scores: { alice: 1500 },
      selectedClue: { value: "$400", question: "Q", answer: "A", isAnswerRevealed: false },
      clueState: { clueKey: "firstBoard:400:Q", lockedOut: {} },
      boardData: { ttsByAnswerKey: { "firstBoard:400:Q": "asset-1" } },
      dailyDouble: { clueKey: "firstBoard:400:Q", wager: 500, playerUsername: "alice" },
      answeringPlayerKey: "alice",
    } as unknown as GameState;
    const { ctx } = makeCtx();

    await autoResolveAfterJudgement(ctx, "g1", game, "alice", "incorrect");

    expect(game.dailyDouble).toBeNull();
    expect(finishClueAndReturnToBoard).toHaveBeenCalledWith(ctx, "g1", game);
    expect(ctx.clearAnswerWindow).not.toHaveBeenCalled();
  });
});
