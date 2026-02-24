import { describe, expect, it, vi } from "vitest";
import type { GameState, PlayerState } from "../types/runtime.js";
import type { Ctx } from "../ws/context.types.js";
import { createCtx } from "../test/createCtx.js";
import { checkBoardTransition, isBoardFullyCleared } from "./stageTransition.js";

function makeCtx(overrides: Partial<Ctx> = {}) {
  return {
    ctx: createCtx(
      {
        isBoardFullyCleared,
        checkAllWagersSubmitted: vi.fn(),
        startGameTimer: vi.fn(),
        broadcast: vi.fn(),
        aiHostVoiceSequence: vi.fn(
          async (_ctx: Ctx, _gameId: string, _game: GameState, steps: Array<{ after?: () => unknown }>) => {
            for (const step of steps) {
              if (typeof step?.after === "function") {
                await step.after();
              }
            }
            return true;
          },
        ),
      },
      overrides,
    ),
  };
}

describe("stageTransition", () => {
  it("isBoardFullyCleared returns false when any clue is uncleared", () => {
    const game = {
      boardData: {
        firstBoard: {
          categories: [
            { values: [{ value: 200, question: "Q1" }, { value: 400, question: "Q2" }] },
          ],
        },
      },
      clearedClues: new Set(["200-Q1"]),
    } as unknown as GameState;

    expect(isBoardFullyCleared(game, "firstBoard")).toBe(false);
  });

  it("checkBoardTransition firstBoard->secondBoard when first board is fully cleared", async () => {
    const players = [
      { username: "alice", displayname: "Alice", name: "alice" },
      { username: "bob", displayname: "Bob", name: "bob" },
    ] as unknown as PlayerState[];

    const game = {
      activeBoard: "firstBoard",
      players,
      scores: { alice: 1000, bob: 800 },
      selectorKey: null,
      selectorName: null,
      boardData: {
        firstBoard: { categories: [{ values: [{ value: 200, question: "Q1" }] }] },
      },
      clearedClues: new Set(["200-Q1"]),
    } as unknown as GameState;

    const { ctx } = makeCtx();

    const transitioned = checkBoardTransition(game, "g1", ctx);
    await Promise.resolve();

    expect(transitioned).toBe(true);
    expect(game.activeBoard).toBe("secondBoard");
    expect(game.selectorKey).toBe("bob");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "transition-to-second-board" }),
    );
  });

  it("checkBoardTransition secondBoard->finalJeopardy initializes final state and starts timer", async () => {
    const game = {
      activeBoard: "secondBoard",
      players: [
        { username: "alice", displayname: "Alice", online: true },
        { username: "bob", displayname: "Bob", online: true },
      ],
      scores: { alice: 1000, bob: 0 },
      boardData: {
        secondBoard: { categories: [{ values: [{ value: 200, question: "Q1" }] }] },
      },
      clearedClues: new Set(["200-Q1"]),
    } as unknown as GameState;

    const { ctx } = makeCtx();

    const transitioned = checkBoardTransition(game, "g1", ctx);
    await Promise.resolve();

    expect(transitioned).toBe(true);
    expect(game.activeBoard).toBe("finalJeopardy");
    expect(game.isFinalJeopardy).toBe(true);
    expect(game.finalJeopardyStage).toBe("wager");
    expect(game.finalJeopardyFinalists).toEqual(["alice"]);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "final-jeopardy", finalists: ["alice"] }),
    );
    await vi.waitFor(() => {
      expect(ctx.startGameTimer).toHaveBeenCalled();
    });
  });
});
