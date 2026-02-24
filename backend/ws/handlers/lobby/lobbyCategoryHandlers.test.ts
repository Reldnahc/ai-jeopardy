import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";
import { lobbyCategoryHandlers } from "./lobbyCategoryHandlers.js";

function makeWs(): SocketState {
  return { id: "ws-1", send: vi.fn(), gameId: "g1" } as unknown as SocketState;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    categories: [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
    ],
    lockedCategories: {
      firstBoard: [false, false, false, false, false],
      secondBoard: [false, false, false, false, false],
      finalJeopardy: [false],
    },
    ...overrides,
  };
}

function makeCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: { g1: game },
      isHostSocket: vi.fn(() => true),
      sendLobbySnapshot: vi.fn(),
      broadcast: vi.fn(),
      normalizeCategories11: vi.fn((c) => (Array.isArray(c) ? c : Array(11).fill(""))),
    },
    overrides,
  );
}

describe("lobbyCategoryHandlers", () => {
  it("toggle-lock-category flips lock and broadcasts", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["toggle-lock-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 2 },
      ctx,
    });

    expect(game.lockedCategories?.firstBoard?.[2]).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "category-lock-updated", boardType: "firstBoard", index: 2, locked: true }),
    );
  });

  it("randomize-category rejects when slot is locked", async () => {
    const ws = makeWs();
    const game = makeGame({
      lockedCategories: {
        firstBoard: [true, false, false, false, false],
        secondBoard: [false, false, false, false, false],
        finalJeopardy: [false],
      },
    });
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["randomize-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 0, candidates: ["X"] },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "error", message: "That category is locked." }));
    expect(ctx.sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });

  it("randomize-category picks first unique candidate and broadcasts update", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["randomize-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 0, candidates: ["B", "X"] },
      ctx,
    });

    expect(game.categories?.[0]).toBe("X");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "category-updated", value: "X" }),
    );
  });

  it("update-categories normalizes and broadcasts category list", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, { normalizeCategories11: vi.fn(() => Array(11).fill("N")) });

    await lobbyCategoryHandlers["update-categories"]({
      ws,
      data: { gameId: "g1", categories: ["foo"] },
      ctx,
    });

    expect(game.categories).toEqual(Array(11).fill("N"));
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "categories-updated" }),
    );
  });
});
