import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import { createCtx, fireAndForget } from "../../test/createCtx.js";
import { advanceToDrawingPhase, checkAllDrawingsSubmitted, checkAllWagersSubmitted, finishGame } from "./phases.js";

function buildGame(overrides: Partial<GameState> = {}): GameState {
  return {
    isFinalJeopardy: true,
    finalJeopardyStage: "wager",
    finalJeopardyFinalists: ["alice", "bob"],
    players: [
      { username: "alice", displayname: "Alice", online: true },
      { username: "bob", displayname: "Bob", online: true },
    ],
    scores: { alice: 2000, bob: 1500 },
    wagers: { alice: 500, bob: 400 },
    drawings: { alice: "a", bob: "b" },
    finalVerdicts: { alice: "incorrect", bob: "incorrect" },
    finalTranscripts: { alice: "x", bob: "y" },
    selectedClue: { question: "Final clue?", answer: "What is test?", isAnswerRevealed: false },
    boardData: {
      finalJeopardy: {
        categories: [{ category: "Science", values: [{ value: 0, question: "Final clue?", answer: "What is test?" }] }],
      },
      ttsByClueKey: {},
    },
    clearedClues: new Set<string>(),
    ...overrides,
  };
}

function buildCtx(overrides: Record<string, unknown> = {}) {
  let timerCb: (() => void) | null = null;
  const ctx = createCtx(
    {
      clearGameTimer: vi.fn(),
      broadcast: vi.fn(),
      aiHostVoiceSequence: vi.fn(
        async (_ctx, _gameId, _game, steps: Array<{ after?: () => unknown }>) => {
          for (const step of steps) {
            if (typeof step.after === "function") await step.after();
          }
          return true;
        },
      ),
      startGameTimer: vi.fn((_gameId, _game, _ctx, _seconds, _kind, cb: () => void) => {
        timerCb = cb;
      }),
      normalizeName: (v: unknown) =>
        String(v ?? "")
          .trim()
          .toLowerCase(),
      repos: {
        profiles: {
          getIdByUsername: vi.fn(async (u: string) => u),
          incrementGamesWon: vi.fn(async () => {}),
          addMoneyWon: vi.fn(async () => {}),
          incrementGamesFinished: vi.fn(async () => {}),
          incrementFinalJeopardyCorrects: vi.fn(async () => {}),
        },
      },
      fireAndForget,
      ...overrides,
    },
    overrides,
  );

  return { ctx, getTimerCb: () => timerCb };
}

describe("finalJeopardy phases", () => {
  it("advanceToDrawingPhase exits when final clue is missing", async () => {
    const game = buildGame({
      boardData: { finalJeopardy: { categories: [{ category: "Science", values: [] }] }, ttsByClueKey: {} },
    });
    const { ctx } = buildCtx();

    await advanceToDrawingPhase(game, "g1", game.wagers || {}, ctx);

    expect(ctx.startGameTimer).not.toHaveBeenCalled();
  });

  it("advanceToDrawingPhase exits when host sequence returns not alive", async () => {
    const game = buildGame();
    const { ctx } = buildCtx({
      aiHostVoiceSequence: vi.fn(async () => false),
    });

    await advanceToDrawingPhase(game, "g1", game.wagers || {}, ctx);

    expect(ctx.startGameTimer).not.toHaveBeenCalled();
  });

  it("advanceToDrawingPhase timer callback backfills missing drawings/verdicts", async () => {
    const game = buildGame({
      finalJeopardyStage: "wager",
      drawings: {},
      finalVerdicts: {},
      finalTranscripts: {},
    });
    const { ctx, getTimerCb } = buildCtx();

    await advanceToDrawingPhase(game, "g1", game.wagers || {}, ctx);
    expect(game.finalJeopardyStage).toBe("drawing");

    const cb = getTimerCb();
    expect(typeof cb).toBe("function");
    cb?.();

    expect(game.drawings).toMatchObject({ alice: "", bob: "" });
    expect(game.finalVerdicts).toMatchObject({ alice: "incorrect", bob: "incorrect" });
    expect(game.finalTranscripts).toMatchObject({ alice: "", bob: "" });
  });

  it("finishGame exits early when opening sequence is not alive", async () => {
    const game = buildGame({ finalJeopardyStage: "drawing" });
    const { ctx } = buildCtx({
      aiHostVoiceSequence: vi.fn(async () => false),
    });

    await finishGame(game, "g1", game.drawings || {}, ctx);

    expect(game.scores).toMatchObject({ alice: 1500, bob: 1100 });
    expect(ctx.broadcast).not.toHaveBeenCalledWith("g1", expect.objectContaining({ type: "final-score-screen" }));
  });

  it("finishGame reveals correct answer via nobody path when none were correct", async () => {
    const game = buildGame({
      finalJeopardyStage: "drawing",
      finalVerdicts: { alice: "incorrect", bob: "incorrect" },
      selectedClue: { question: "Final clue?", answer: "What is test?", isAnswerRevealed: false },
    });
    const { ctx } = buildCtx();

    await finishGame(game, "g1", game.drawings || {}, ctx);

    expect(game.selectedClue?.isAnswerRevealed).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", expect.objectContaining({ type: "answer-revealed" }));
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", expect.objectContaining({ type: "final-score-screen" }));
  });

  it("checkAll submitted helpers obey stage and final-jeopardy guards", async () => {
    const game = buildGame({ isFinalJeopardy: false, finalJeopardyStage: "wager" });
    const { ctx } = buildCtx();

    checkAllWagersSubmitted(game, "g1", ctx);
    checkAllDrawingsSubmitted(game, "g1", ctx);

    expect(ctx.clearGameTimer).not.toHaveBeenCalled();
  });

  it("checkAllWagersSubmitted does not advance until every finalist has wagered", () => {
    const game = buildGame({
      isFinalJeopardy: true,
      finalJeopardyStage: "wager",
      wagers: { alice: 100 },
      finalJeopardyFinalists: ["alice", "bob"],
    });
    const { ctx } = buildCtx();

    checkAllWagersSubmitted(game, "g1", ctx);

    expect(game.finalJeopardyStage).toBe("wager");
  });

  it("checkAllDrawingsSubmitted does not finish until every finalist has drawn", () => {
    const game = buildGame({
      isFinalJeopardy: true,
      finalJeopardyStage: "drawing",
      drawings: { alice: "a" },
      finalJeopardyFinalists: ["alice", "bob"],
    });
    const { ctx } = buildCtx();

    checkAllDrawingsSubmitted(game, "g1", ctx);

    expect(game.finalJeopardyStage).toBe("drawing");
    expect(ctx.broadcast).not.toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "all-drawings-submitted" }),
    );
  });
});
