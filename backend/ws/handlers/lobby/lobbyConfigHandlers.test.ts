import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";
import { lobbyConfigHandlers } from "./lobbyConfigHandlers.js";
import { MAX_LOBBY_PLAYERS } from "../../../lobby/constants.js";

function makeWs(): SocketState {
  return { id: "ws-1", send: vi.fn(), gameId: "g1" } as unknown as SocketState;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    inLobby: true,
    host: "alice",
    players: [{ username: "alice", displayname: "Alice", online: true }],
    lobbySettings: {
      timeToBuzz: 10,
      timeToAnswer: 10,
      selectedModel: "gpt-4o-mini",
      reasoningEffort: "off",
      visualMode: "off",
      narrationEnabled: true,
      boardJson: "",
    },
    ...overrides,
  };
}

function makeCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: { g1: game },
      isHostSocket: vi.fn(() => true),
      appConfig: { ai: { defaultModel: "gpt-4o-mini" } },
      broadcast: vi.fn(),
      requireHost: vi.fn(() => true),
      buildLobbyState: vi.fn(() => ({ type: "lobby-state", gameId: "g1" })),
    },
    overrides,
  );
}

describe("lobbyConfigHandlers", () => {
  it("update-lobby-settings validates missing gameId", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyConfigHandlers["update-lobby-settings"]({
      ws,
      data: { patch: { timeToBuzz: 5 } },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "update-lobby-settings missing gameId" }),
    );
  });

  it("update-lobby-settings validates unknown game", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, { games: {} });

    await lobbyConfigHandlers["update-lobby-settings"]({
      ws,
      data: { gameId: "missing", patch: { timeToBuzz: 5 } },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Game missing not found." }),
    );
  });

  it("update-lobby-settings rejects non-host", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, { isHostSocket: vi.fn(() => false) });

    await lobbyConfigHandlers["update-lobby-settings"]({
      ws,
      data: { gameId: "g1", patch: { timeToBuzz: 5 } },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Only the host can update lobby settings"));
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("update-lobby-settings clamps numeric bounds and broadcasts", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyConfigHandlers["update-lobby-settings"]({
      ws,
      data: {
        gameId: "g1",
        patch: {
          timeToBuzz: 100,
          timeToAnswer: 0,
          selectedModel: "gpt-5",
          reasoningEffort: "high",
          visualMode: "brave",
          narrationEnabled: false,
        },
      },
      ctx,
    });

    expect(game.lobbySettings?.timeToBuzz).toBe(60);
    expect(game.lobbySettings?.timeToAnswer).toBe(1);
    expect(game.lobbySettings?.selectedModel).toBe("gpt-5");
    expect(game.lobbySettings?.reasoningEffort).toBe("high");
    expect(game.lobbySettings?.visualMode).toBe("brave");
    expect(game.lobbySettings?.narrationEnabled).toBe(false);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "lobby-settings-updated" }),
    );
  });

  it("update-lobby-settings initializes defaults when lobbySettings missing", async () => {
    const ws = makeWs();
    const game = makeGame({ lobbySettings: undefined });
    const ctx = makeCtx(game, { appConfig: { ai: { defaultModel: "gpt-default" } } });

    await lobbyConfigHandlers["update-lobby-settings"]({
      ws,
      data: { gameId: "g1", patch: { boardJson: "{\"ok\":true}" } },
      ctx,
    });

    expect(game.lobbySettings).toMatchObject({
      selectedModel: "gpt-default",
      boardJson: "{\"ok\":true}",
    });
    expect(ctx.broadcast).toHaveBeenCalled();
  });

  it("check-lobby responds true only for in-lobby game", async () => {
    const ws = makeWs();
    const game = makeGame({ inLobby: true });
    const ctx = makeCtx(game);

    await lobbyConfigHandlers["check-lobby"]({ ws, data: { gameId: "g1" }, ctx });
    await lobbyConfigHandlers["check-lobby"]({ ws, data: { gameId: "missing" }, ctx });

    expect(ws.send).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({
        type: "check-lobby-response",
        isValid: true,
        isFull: false,
        maxPlayers: MAX_LOBBY_PLAYERS,
        gameId: "g1",
      }),
    );
    expect(ws.send).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({
        type: "check-lobby-response",
        isValid: false,
        isFull: false,
        maxPlayers: MAX_LOBBY_PLAYERS,
        gameId: "missing",
      }),
    );
  });

  it("check-lobby marks full when max players reached for new user", async () => {
    const ws = makeWs();
    const game = makeGame({
      players: Array.from({ length: MAX_LOBBY_PLAYERS }, (_, i) => ({
        username: `p${i + 1}`,
        displayname: `P${i + 1}`,
        online: true,
      })),
    });
    const ctx = makeCtx(game);

    await lobbyConfigHandlers["check-lobby"]({
      ws,
      data: { gameId: "g1", username: "newbie" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "check-lobby-response",
        isValid: false,
        isFull: true,
        maxPlayers: MAX_LOBBY_PLAYERS,
        gameId: "g1",
      }),
    );
  });

  it("check-lobby allows existing player even when lobby is full", async () => {
    const ws = makeWs();
    const game = makeGame({
      players: Array.from({ length: MAX_LOBBY_PLAYERS }, (_, i) => ({
        username: `p${i + 1}`,
        displayname: `P${i + 1}`,
        online: true,
      })),
    });
    const ctx = makeCtx(game);

    await lobbyConfigHandlers["check-lobby"]({
      ws,
      data: { gameId: "g1", username: "p1" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "check-lobby-response",
        isValid: true,
        isFull: false,
        maxPlayers: MAX_LOBBY_PLAYERS,
        gameId: "g1",
      }),
    );
  });

  it("promote-host updates host and broadcasts player list", async () => {
    const ws = makeWs();
    const game = makeGame({
      host: "alice",
      players: [
        { username: "alice", displayname: "Alice", online: true },
        { username: "bob", displayname: "Bob", online: true },
      ],
    });
    const ctx = makeCtx(game, { requireHost: vi.fn(() => true) });

    await lobbyConfigHandlers["promote-host"]({
      ws,
      data: { gameId: "g1", targetUsername: "bob" },
      ctx,
    });

    expect(game.host).toBe("bob");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "player-list-update", host: "bob" }),
    );
  });

  it("promote-host no-ops when caller is not host", async () => {
    const ws = makeWs();
    const game = makeGame({
      players: [
        { username: "alice", displayname: "Alice", online: true },
        { username: "bob", displayname: "Bob", online: true },
      ],
    });
    const ctx = makeCtx(game, { requireHost: vi.fn(() => false) });

    await lobbyConfigHandlers["promote-host"]({
      ws,
      data: { gameId: "g1", targetUsername: "bob" },
      ctx,
    });

    expect(game.host).toBe("alice");
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("promote-host no-ops when target user is missing", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyConfigHandlers["promote-host"]({
      ws,
      data: { gameId: "g1", targetUsername: "nobody" },
      ctx,
    });

    expect(game.host).toBe("alice");
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("promote-host no-ops when target already host", async () => {
    const ws = makeWs();
    const game = makeGame({
      host: "alice",
      players: [{ username: "alice", displayname: "Alice", online: true }],
    });
    const ctx = makeCtx(game);

    await lobbyConfigHandlers["promote-host"]({
      ws,
      data: { gameId: "g1", targetUsername: "alice" },
      ctx,
    });

    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("request-lobby-state sends snapshot to caller", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyConfigHandlers["request-lobby-state"]({ ws, data: { gameId: "g1" }, ctx });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "lobby-state", gameId: "g1" }));
  });

  it("request-lobby-state errors when snapshot is unavailable", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, { buildLobbyState: vi.fn(() => null) });

    await lobbyConfigHandlers["request-lobby-state"]({ ws, data: { gameId: "g1" }, ctx });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Lobby does not exist!" }),
    );
  });
});
