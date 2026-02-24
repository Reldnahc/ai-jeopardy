import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";
import { miscHandlers } from "./miscHandlers.js";

function makeWs() {
  return { id: "ws-1", send: vi.fn(), gameId: null } as any;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    activeBoard: "firstBoard",
    players: [{ username: "alice", displayname: "Alice", online: true }],
    boardData: {
      firstBoard: {
        categories: [{ values: [{ value: 200, question: "Q1" }, { value: 400, question: "Q2" }] }],
      },
    },
    clearedClues: new Set<string>(),
    scores: { alice: 1000 },
    lobbySettings: { narrationEnabled: true },
    ...overrides,
  };
}

function makeCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: { g1: game },
      broadcast: vi.fn(),
      requireHost: vi.fn(() => true),
      cancelAutoUnlock: vi.fn(),
      doUnlockBuzzerAuthoritative: vi.fn(),
      checkBoardTransition: vi.fn(() => true),
      clearAnswerWindow: vi.fn(),
      submitWager: vi.fn(async () => {}),
      submitDrawing: vi.fn(async () => {}),
      submitWagerDrawing: vi.fn(async () => {}),
      ensureTtsAsset: vi.fn(async () => ({ id: "asset-1" })),
      repos: {},
      checkAllWagersSubmitted: vi.fn(),
      checkAllDrawingsSubmitted: vi.fn(),
    },
    overrides,
  );
}

describe("miscHandlers", () => {
  it("dd-snipe-next toggles flag and broadcasts state", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await miscHandlers["dd-snipe-next"]({ ws, data: { gameId: "g1", enabled: true }, ctx });

    expect(game.ddSnipeNext).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "dd-snipe-next-set", enabled: true });
  });

  it("update-score applies delta and broadcasts scores", async () => {
    const ws = makeWs();
    const game = makeGame({ scores: { alice: 1000 } });
    const ctx = makeCtx(game);

    await miscHandlers["update-score"]({
      ws,
      data: { gameId: "g1", username: "alice", delta: 200 },
      ctx,
    });

    expect(game.scores?.alice).toBe(1200);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "update-scores", scores: game.scores });
  });

  it("mark-all-complete marks active board clues and checks transition", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await miscHandlers["mark-all-complete"]({ ws, data: { gameId: "g1" }, ctx });

    expect(game.clearedClues?.has("200-Q1")).toBe(true);
    expect(game.clearedClues?.has("400-Q2")).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "cleared-clues-sync" }),
    );
    expect(ctx.checkBoardTransition).toHaveBeenCalledWith(game, "g1", ctx);
  });

  it("tts-ensure sends error when narration is disabled", async () => {
    const ws = makeWs();
    const game = makeGame({ lobbySettings: { narrationEnabled: false } });
    const ctx = makeCtx(game);

    await miscHandlers["tts-ensure"]({
      ws,
      data: { gameId: "g1", text: "hello", requestId: "r1" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "tts-error", requestId: "r1", message: "Narration disabled" }),
    );
  });
});
