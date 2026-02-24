import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";
import { lobbyConfigHandlers } from "./lobbyConfigHandlers.js";

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

  it("request-lobby-state sends snapshot to caller", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await lobbyConfigHandlers["request-lobby-state"]({ ws, data: { gameId: "g1" }, ctx });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "lobby-state", gameId: "g1" }));
  });
});
