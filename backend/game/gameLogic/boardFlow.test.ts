import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../types/runtime.js";
import { createCtx } from "../../test/createCtx.js";
import { finishClueAndReturnToBoard } from "./boardFlow.js";

function makeCtx(overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      broadcast: vi.fn(),
      checkBoardTransition: vi.fn(() => false),
      aiHostVoiceSequence: vi.fn(async (_ctx, _gameId, _game, steps: Array<{ after?: () => unknown }>) => {
        for (const step of steps) {
          if (typeof step?.after === "function") {
            await step.after();
          }
        }
        return true;
      }),
      fireAndForget: (p: PromiseLike<unknown>) => {
        void p;
      },
      getTtsDurationMs: vi.fn(async () => 0),
      sleepAndCheckGame: vi.fn(async () => true),
      startGameTimer: vi.fn(),
      checkAllWagersSubmitted: vi.fn(),
      isBoardFullyCleared: vi.fn(() => false),
    },
    overrides,
  );
}

describe("boardFlow", () => {
  it("returns to board even when there is no selected clue", async () => {
    const game = {
      selectedClue: null,
      selectorName: "Alice",
    } as unknown as GameState;
    const ctx = makeCtx();

    finishClueAndReturnToBoard(ctx, "g1", game);
    await Promise.resolve();
    await Promise.resolve();

    expect(game.phase).toBe("board");
    expect(ctx.broadcast).not.toHaveBeenCalledWith("g1", expect.objectContaining({ type: "clue-cleared" }));
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "returned-to-board" }),
    );
  });

  it("clears clue, returns to board, and announces selector when not transitioned", async () => {
    const game = {
      selectedClue: { value: 400, question: "Q1" },
      clearedClues: new Set<string>(),
      selectorName: "Alice",
    } as unknown as GameState;
    const ctx = makeCtx();

    finishClueAndReturnToBoard(ctx, "g1", game);
    await Promise.resolve();
    await Promise.resolve();

    expect(game.phase).toBe("board");
    expect(game.selectedClue).toBeNull();
    expect(game.buzzerLocked).toBe(true);
    expect(game.clearedClues?.has("400-Q1")).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "clue-cleared", clueId: "400-Q1" });
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "daily-double-hide-modal" });
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "phase-changed", phase: "board" }),
    );
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "board-selection-unlocked" }),
    );
  });

  it("creates clearedClues when missing", () => {
    const game = {
      selectedClue: { value: 600, question: "Q3" },
    } as unknown as GameState;
    const ctx = makeCtx({ fireAndForget: vi.fn() });

    finishClueAndReturnToBoard(ctx, "g1", game);

    expect(game.clearedClues?.has("600-Q3")).toBe(true);
  });

  it("does not unlock board when lock version changes before selector prompt finishes", async () => {
    const game = {
      selectedClue: null,
      selectorName: "Alice",
    } as unknown as GameState;
    const ctx = makeCtx({
      aiHostVoiceSequence: vi.fn(async (_ctx, _gameId, g, steps: Array<{ after?: () => unknown }>) => {
        g.boardSelectionLockVersion = (g.boardSelectionLockVersion || 0) + 1;
        for (const step of steps) {
          if (typeof step?.after === "function") {
            await step.after();
          }
        }
        return true;
      }),
    });

    finishClueAndReturnToBoard(ctx, "g1", game);
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.broadcast).not.toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "board-selection-unlocked" }),
    );
  });

  it("skips selector announcement when transitioned", () => {
    const game = {
      selectedClue: { value: 200, question: "Q2" },
      clearedClues: new Set<string>(),
    } as unknown as GameState;
    const ctx = makeCtx({ checkBoardTransition: vi.fn(() => true), fireAndForget: vi.fn() });

    finishClueAndReturnToBoard(ctx, "g1", game);

    expect(ctx.fireAndForget).not.toHaveBeenCalled();
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "returned-to-board" }),
    );
  });

  it("returns early when game is missing", () => {
    const ctx = makeCtx();
    expect(() => finishClueAndReturnToBoard(ctx, "g1", null as unknown as GameState)).not.toThrow();
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });
});
