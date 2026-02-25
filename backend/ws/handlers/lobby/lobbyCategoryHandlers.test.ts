import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUniqueCategories } from "../../../services/categories/getUniqueCategories.js";
import { lobbyCategoryHandlers } from "./lobbyCategoryHandlers.js";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";

vi.mock("../../../services/categories/getUniqueCategories.js", () => ({
  getUniqueCategories: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getUniqueCategories).mockReset();
});

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

  it("toggle-lock-category rejects non-host and snapshots", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, { isHostSocket: vi.fn(() => false) });

    await lobbyCategoryHandlers["toggle-lock-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 2 },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Only the host can toggle category locks." }),
    );
    expect(ctx.sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });

  it("toggle-lock-category initializes lock state when missing", async () => {
    const ws = makeWs();
    const game = makeGame({ lockedCategories: undefined });
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["toggle-lock-category"]({
      ws,
      data: { gameId: "g1", boardType: "finalJeopardy", index: 0 },
      ctx,
    });

    expect(game.lockedCategories?.finalJeopardy?.[0]).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "category-lock-updated", boardType: "finalJeopardy", index: 0, locked: true }),
    );
  });

  it("toggle-lock-category no-ops for out-of-range indexes", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["toggle-lock-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 9 },
      ctx,
    });

    expect(ctx.broadcast).not.toHaveBeenCalled();
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
      data: { gameId: "g1", boardType: "firstBoard", index: 0 },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "error", message: "That category is locked." }));
    expect(ctx.sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });

  it("randomize-category picks first unique candidate and broadcasts update", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);
    vi.mocked(getUniqueCategories).mockReturnValue(["X"]);

    await lobbyCategoryHandlers["randomize-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 0 },
      ctx,
    });

    expect(game.categories?.[0]).toBe("X");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "category-updated", value: "X" }),
    );
  });

  it("randomize-category rejects when there is no unique candidate", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);
    vi.mocked(getUniqueCategories).mockReturnValue([]);

    await lobbyCategoryHandlers["randomize-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 0 },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "No unique random category available." }),
    );
    expect(ctx.sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });

  it("update-category validates required gameId", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { boardType: "firstBoard", index: 0, value: "X" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "update-category missing gameId" }),
    );
  });

  it("update-category rejects invalid boardType and snapshots", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { gameId: "g1", boardType: "bogus", index: 0, value: "X" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Invalid boardType"));
    expect(ctx.sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });

  it("update-category rejects invalid index and snapshots", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: "NaN", value: "X" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Invalid index"));
    expect(ctx.sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });

  it("update-category rejects locked category", async () => {
    const ws = makeWs();
    const game = makeGame({
      lockedCategories: {
        firstBoard: [false, true, false, false, false],
        secondBoard: [false, false, false, false, false],
        finalJeopardy: [false],
      },
    });
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 1, value: "X" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "That category is locked." }),
    );
    expect(ctx.sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });

  it("update-category rejects locked final jeopardy category", async () => {
    const ws = makeWs();
    const game = makeGame({
      lockedCategories: {
        firstBoard: [false, false, false, false, false],
        secondBoard: [false, false, false, false, false],
        finalJeopardy: [true],
      },
    });
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { gameId: "g1", boardType: "finalJeopardy", index: 0, value: "X" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "That category is locked." }),
    );
    expect(ctx.sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });

  it("update-category errors when categories state is invalid", async () => {
    const ws = makeWs();
    const game = makeGame({ categories: undefined });
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 0, value: "X" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Server error: invalid categories state." }),
    );
    expect(ctx.sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });

  it("update-category updates value and broadcasts", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { gameId: "g1", boardType: "secondBoard", index: 1, value: "  New Cat" },
      ctx,
    });

    expect(game.categories?.[6]).toBe("New Cat");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "category-updated", boardType: "secondBoard", index: 1, value: "New Cat" }),
    );
  });

  it("update-category catches internal errors and sends server error", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, {
      broadcast: vi.fn(() => {
        throw new Error("boom");
      }),
    });

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 0, value: "X" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Server error while updating category." }),
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

  it("update-categories errors when game is missing", async () => {
    const ws = makeWs();
    const ctx = makeCtx(makeGame(), { games: {} });

    await lobbyCategoryHandlers["update-categories"]({
      ws,
      data: { gameId: "missing", categories: ["foo"] },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "error",
        message: "Game missing not found while updating categories.",
      }),
    );
  });
});
