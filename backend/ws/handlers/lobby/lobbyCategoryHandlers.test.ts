import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUniqueCategories } from "../../../services/categories/getUniqueCategories.js";
import { generateCategoryPoolFromOpenAi } from "../../../services/ai/categoryPool.js";
import { lobbyCategoryHandlers } from "./lobbyCategoryHandlers.js";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";

vi.mock("../../../services/categories/getUniqueCategories.js", () => ({
  getUniqueCategories: vi.fn(),
}));
vi.mock("../../../services/ai/categoryPool.js", () => ({
  generateCategoryPoolFromOpenAi: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getUniqueCategories).mockReset();
  vi.mocked(generateCategoryPoolFromOpenAi).mockReset();
});

function makeWs(role: string = "default"): SocketState {
  return {
    id: "ws-1",
    send: vi.fn(),
    gameId: "g1",
    auth: { isAuthed: true, userId: "u1", role: role as never },
  } as unknown as SocketState;
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

  it("toggle-lock-category allows non-host callers", async () => {
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

  it("randomize-category prefers pool candidates before generator fallback", async () => {
    const ws = makeWs();
    const game = makeGame({
      categoryPool: ["A", "Pool Choice", "B"],
    });
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["randomize-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 0 },
      ctx,
    });

    expect(game.categories?.[0]).toBe("Pool Choice");
    expect(getUniqueCategories).not.toHaveBeenCalled();
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

  it("randomize-category handles generator errors and returns user-facing error", async () => {
    const ws = makeWs();
    const game = makeGame({ categoryPool: [] });
    const ctx = makeCtx(game);
    vi.mocked(getUniqueCategories).mockImplementation(() => {
      throw new Error("boom");
    });

    await lobbyCategoryHandlers["randomize-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 0 },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "No unique random category available." }),
    );
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

  it("update-category rejects out-of-range index and snapshots", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { gameId: "g1", boardType: "firstBoard", index: 8, value: "X" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Index out of range"));
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

  it("update-category errors when game does not exist", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, { games: {} });

    await lobbyCategoryHandlers["update-category"]({
      ws,
      data: { gameId: "missing", boardType: "firstBoard", index: 0, value: "X" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Game missing not found." }),
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

  it("refresh-category-pool preserves locked categories and replaces only unlocked slots", async () => {
    const ws = makeWs();
    const game = makeGame({
      inLobby: true,
      categories: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"],
      lockedCategories: {
        firstBoard: [false, true, false, false, false],
        secondBoard: [false, false, false, true, false],
        finalJeopardy: [true],
      },
      lobbySettings: { categoryRefreshLocked: false, categoryPoolPrompt: "" } as never,
    });
    const ctx = makeCtx(game);

    vi.mocked(generateCategoryPoolFromOpenAi).mockResolvedValue([
      "P1",
      "P2",
      "P3",
      "P4",
      "P5",
      "P6",
      "P7",
      "P8",
      "P9",
      "P10",
      "P11",
      "P12",
    ]);

    await lobbyCategoryHandlers["refresh-category-pool"]({
      ws,
      data: { gameId: "g1" },
      ctx,
    });

    expect(game.categories?.[1]).toBe("B");
    expect(game.categories?.[8]).toBe("I");
    expect(game.categories?.[10]).toBe("K");

    expect(game.categories?.[0]).not.toBe("A");
    expect(game.categories?.[2]).not.toBe("C");
    expect(game.categories?.[9]).not.toBe("J");
    expect(game.categories?.[0]).toMatch(/^P/);
    expect(game.categories?.[2]).toMatch(/^P/);
    expect(game.categories?.[9]).toMatch(/^P/);

    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "categories-updated" }),
    );
  });

  it("refresh-category-pool enforces cooldown for default role", async () => {
    const ws = makeWs("default");
    const game = makeGame({
      inLobby: true,
      categoryPoolNextAllowedAtMs: Date.now() + 30_000,
      lobbySettings: { categoryRefreshLocked: false, categoryPoolPrompt: "" } as never,
    });
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["refresh-category-pool"]({
      ws,
      data: { gameId: "g1" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Category pool refresh is on cooldown."));
    expect(generateCategoryPoolFromOpenAi).not.toHaveBeenCalled();
  });

  it("refresh-category-pool blocks when host lock is enabled", async () => {
    const ws = makeWs("default");
    const game = makeGame({
      inLobby: true,
      lobbySettings: { categoryRefreshLocked: true, categoryPoolPrompt: "" } as never,
    });
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["refresh-category-pool"]({
      ws,
      data: { gameId: "g1" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Category refresh is locked by the host." }),
    );
  });

  it("refresh-category-pool blocks when a refresh is already in progress", async () => {
    const ws = makeWs("admin");
    const game = makeGame({
      inLobby: true,
      categoryPoolGenerating: true,
      lobbySettings: { categoryRefreshLocked: false, categoryPoolPrompt: "" } as never,
    });
    const ctx = makeCtx(game);

    await lobbyCategoryHandlers["refresh-category-pool"]({
      ws,
      data: { gameId: "g1" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Category pool refresh already in progress." }),
    );
  });

  it("refresh-category-pool bypasses cooldown for privileged role and higher", async () => {
    const ws = makeWs("privileged");
    const game = makeGame({
      inLobby: true,
      categoryPoolNextAllowedAtMs: Date.now() + 30_000,
      lobbySettings: { categoryRefreshLocked: false, categoryPoolPrompt: "" } as never,
    });
    const ctx = makeCtx(game);

    vi.mocked(generateCategoryPoolFromOpenAi).mockResolvedValue([
      "P1",
      "P2",
      "P3",
      "P4",
      "P5",
      "P6",
      "P7",
      "P8",
      "P9",
      "P10",
      "P11",
      "P12",
    ]);

    await lobbyCategoryHandlers["refresh-category-pool"]({
      ws,
      data: { gameId: "g1" },
      ctx,
    });

    expect(generateCategoryPoolFromOpenAi).toHaveBeenCalled();
    expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining("on cooldown"));
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "categories-updated" }),
    );
  });
});
