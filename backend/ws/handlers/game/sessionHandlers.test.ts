import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";
import { sessionHandlers } from "./sessionHandlers.js";

function makeWs(id = "ws-1"): SocketState {
  return { id, send: vi.fn(), gameId: null } as unknown as SocketState;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    host: "host",
    players: [],
    clearedClues: new Set<string>(),
    boardData: {},
    activeBoard: "firstBoard",
    scores: {},
    ...overrides,
  };
}

function makeCtx(games: Record<string, GameState>, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games,
      repos: {
        profiles: {
          getPublicProfileByUsername: vi.fn(async (u: string) => ({
            displayname: `${u}-dn`,
            color: "bg-red-500",
            text_color: "text-white",
          })),
        },
      },
      broadcast: vi.fn(),
      checkAllWagersSubmitted: vi.fn(),
      checkAllDrawingsSubmitted: vi.fn(),
    },
    overrides,
  );
}

describe("sessionHandlers", () => {
  it("join-game rejects blank username", async () => {
    const ws = makeWs();
    const ctx = makeCtx({ g1: makeGame() });

    await sessionHandlers["join-game"]({ ws, data: { gameId: "g1", username: "   " }, ctx });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Username cannot be blank." }),
    );
  });

  it("join-game rejects unknown game", async () => {
    const ws = makeWs();
    const ctx = makeCtx({});

    await sessionHandlers["join-game"]({ ws, data: { gameId: "missing", username: "alice" }, ctx });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Game does not exist!" }),
    );
  });

  it("join-game adds new player and sends game-state snapshot", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx({ g1: game });

    await sessionHandlers["join-game"]({
      ws,
      data: { gameId: "g1", username: "alice", displayname: "Alice" },
      ctx,
    });

    expect(game.players).toHaveLength(1);
    expect(game.players?.[0]).toMatchObject({ username: "alice", displayname: "Alice", id: "ws-1" });
    expect(ws.gameId).toBe("g1");
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("\"type\":\"game-state\""));
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "player-list-update" }),
    );
  });

  it("join-game reconnects existing player by username and updates displayname", async () => {
    const ws = makeWs("ws-new");
    const game = makeGame({
      players: [{ id: "old-id", username: "alice", displayname: "Old Alice", online: false }],
    });
    const ctx = makeCtx({ g1: game });

    await sessionHandlers["join-game"]({
      ws,
      data: { gameId: "g1", username: "alice", displayname: "Alice" },
      ctx,
    });

    expect(game.players[0]).toMatchObject({
      id: "ws-new",
      username: "alice",
      displayname: "Alice",
      online: true,
    });
    expect(ws.gameId).toBe("g1");
    expect(ctx.repos.profiles.getPublicProfileByUsername).not.toHaveBeenCalled();
  });

  it("join-game sends active ai-host-say playback metadata when in progress", async () => {
    const ws = makeWs();
    const now = Date.now();
    const game = makeGame({
      aiHostPlayback: {
        assetId: "asset-1",
        startedAtMs: now - 1000,
        durationMs: 5000,
      },
    });
    const ctx = makeCtx({ g1: game });

    await sessionHandlers["join-game"]({
      ws,
      data: { gameId: "g1", username: "alice", displayname: "Alice" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("\"type\":\"game-state\""));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("\"type\":\"ai-host-say\""));
  });

  it("join-game handles profile-fetch race where player is inserted before await resumes", async () => {
    const ws = makeWs("ws-race");
    const game = makeGame({ players: [] });
    const ctx = makeCtx({ g1: game }, {
      repos: {
        profiles: {
          getPublicProfileByUsername: vi.fn(async (u: string) => {
            game.players.push({ id: "old", username: u, displayname: "Race", online: false });
            return { displayname: "Race", color: "bg-red-500", text_color: "text-white" };
          }),
        },
      },
    });

    await sessionHandlers["join-game"]({
      ws,
      data: { gameId: "g1", username: "alice", displayname: "Alice" },
      ctx,
    });

    expect(game.players).toHaveLength(1);
    expect(game.players[0]).toMatchObject({ id: "ws-race", username: "alice", online: true });
  });

  it("leave-game removes last player and deletes game", async () => {
    const ws = makeWs("ws-1");
    const game = makeGame({
      players: [{ id: "ws-1", username: "alice", displayname: "Alice" }],
      scores: { alice: 1000 },
      wagers: { alice: 100 },
    });
    const games = { g1: game };
    const ctx = makeCtx(games);

    await sessionHandlers["leave-game"]({ ws, data: { gameId: "g1", username: "alice" }, ctx });

    expect(games.g1).toBeUndefined();
  });

  it("leave-game keeps game with remaining players and triggers finalist checks", async () => {
    const ws = makeWs("ws-1");
    const game = makeGame({
      players: [
        { id: "ws-1", username: "alice", displayname: "Alice" },
        { id: "ws-2", username: "bob", displayname: "Bob" },
      ],
      scores: { alice: 1000, bob: 500 },
      wagers: { alice: 100, bob: 50 },
      drawings: { alice: "a", bob: "b" },
      finalWagerDrawings: { alice: "wa", bob: "wb" },
      buzzLockouts: { alice: 1, bob: 2 },
    });
    const ctx = makeCtx({ g1: game });

    await sessionHandlers["leave-game"]({ ws, data: { gameId: "g1", username: "alice" }, ctx });

    expect(game.players?.map((p) => p.username)).toEqual(["bob"]);
    expect(game.scores?.alice).toBeUndefined();
    expect(game.wagers?.alice).toBeUndefined();
    expect(game.drawings?.alice).toBeUndefined();
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "player-list-update" }),
    );
    expect(ctx.checkAllWagersSubmitted).toHaveBeenCalledWith(game, "g1", ctx);
    expect(ctx.checkAllDrawingsSubmitted).toHaveBeenCalledWith(game, "g1", ctx);
  });

  it("leave-game no-ops when player is not found", async () => {
    const ws = makeWs("ws-x");
    const game = makeGame({
      players: [{ id: "ws-1", username: "alice", displayname: "Alice" }],
    });
    const ctx = makeCtx({ g1: game });

    await sessionHandlers["leave-game"]({ ws, data: { gameId: "g1", username: "bob" }, ctx });

    expect(game.players).toHaveLength(1);
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });
});
