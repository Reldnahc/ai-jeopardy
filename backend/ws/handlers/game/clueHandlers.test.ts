import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx, fireAndForget } from "../../../test/createCtx.js";
import { clueHandlers } from "./clueHandlers.js";

function makeWs() {
  return { id: "ws-1", send: vi.fn(), gameId: null } as unknown as SocketState;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "board",
    activeBoard: "firstBoard",
    selectorKey: "alice",
    selectorName: "Alice",
    boardSelectionLocked: false,
    players: [{ id: "ws-1", username: "alice", displayname: "Alice" }],
    boardData: {
      ttsByClueKey: { "firstBoard:400:Q": "asset-1" },
      dailyDoubleClueKeys: { firstBoard: ["firstBoard:400:Q"] },
    },
    clearedClues: new Set<string>(),
    scores: { alice: 1000 },
    ...overrides,
  };
}

function makeCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: { g1: game },
      getPlayerForSocket: vi.fn(() => game.players?.[0] ?? null),
      playerStableId: vi.fn((p: { username?: string }) => p.username),
      cancelAutoUnlock: vi.fn(),
      fireAndForget,
      repos: {
        profiles: {
          incrementCluesSelected: vi.fn(async () => {}),
          incrementDailyDoubleFound: vi.fn(async () => {}),
        },
      },
      findCategoryForClue: vi.fn(() => "Science"),
      broadcast: vi.fn(),
      computeDailyDoubleMaxWager: vi.fn(() => 1200),
      aiHostVoiceSequence: vi.fn(
        async (_ctx, _gameId, _game, steps: Array<{ after?: () => unknown }>) => {
          for (const step of steps) {
            if (typeof step.after === "function") await step.after();
          }
          return true;
        },
      ),
      startDdWagerCapture: vi.fn(),
      doUnlockBuzzerAuthoritative: vi.fn(),
      getTtsDurationMs: vi.fn(async () => 0),
      sleepAndCheckGame: vi.fn(async () => true),
    },
    overrides,
  );
}

describe("clueHandlers", () => {
  it("blocks clue selection when phase is not board", async () => {
    const ws = makeWs();
    const game = makeGame({ phase: "clue" });
    const ctx = makeCtx(game);

    await clueHandlers["clue-selected"]({ ws, data: { gameId: "g1", clue: { value: 400, question: "Q" } }, ctx });

    expect(game.selectedClue).toBeUndefined();
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("blocks clue selection when caller is not selector", async () => {
    const ws = makeWs();
    const game = makeGame({ selectorKey: "bob" });
    const ctx = makeCtx(game);

    await clueHandlers["clue-selected"]({ ws, data: { gameId: "g1", clue: { value: 400, question: "Q" } }, ctx });

    expect(game.selectedClue).toBeUndefined();
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("starts daily double wager capture for DD clue", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await clueHandlers["clue-selected"]({
      ws,
      data: { gameId: "g1", clue: { value: 400, question: "Q", category: "Science" } },
      ctx,
    });

    expect(game.dailyDouble).toMatchObject({
      clueKey: "firstBoard:400:Q",
      playerUsername: "alice",
      stage: "wager_listen",
      maxWager: 1200,
    });
    expect(ctx.startDdWagerCapture).toHaveBeenCalledWith("g1", game, ctx);
    expect(ctx.doUnlockBuzzerAuthoritative).not.toHaveBeenCalled();
  });

  it("unlocks buzzer for normal clue path", async () => {
    const ws = makeWs();
    const game = makeGame({
      boardData: {
        ttsByClueKey: { "firstBoard:400:Q": "asset-1" },
        dailyDoubleClueKeys: { firstBoard: [] },
      },
    });
    const ctx = makeCtx(game);

    await clueHandlers["clue-selected"]({
      ws,
      data: { gameId: "g1", clue: { value: 400, question: "Q", category: "Science" } },
      ctx,
    });

    expect(game.phase).toBe("clue");
    expect(game.clueState?.clueKey).toBe("firstBoard:400:Q");
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", expect.objectContaining({ type: "clue-selected" }));
    expect(ctx.doUnlockBuzzerAuthoritative).toHaveBeenCalledWith("g1", game, ctx);
  });
});
