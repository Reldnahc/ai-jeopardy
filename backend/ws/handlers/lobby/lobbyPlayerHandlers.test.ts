import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";
import { lobbyPlayerHandlers } from "./lobbyPlayerHandlers.js";

function makeWs(id = "ws-1"): SocketState {
  return { id, send: vi.fn(), gameId: null } as unknown as SocketState;
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: {},
      normalizeCategories11: vi.fn(() => Array(11).fill("Category")),
      appConfig: { ai: { defaultModel: "gpt-4o-mini", defaultSttProvider: "openai" } },
      buildLobbyState: vi.fn((gameId: string) => ({ type: "lobby-state", gameId })),
      cancelLobbyCleanup: vi.fn(),
      scheduleLobbyCleanupIfEmpty: vi.fn(),
      broadcast: vi.fn(),
      playerStableId: vi.fn((p: { username?: string }) => p.username),
    },
    overrides,
  );
}

describe("lobbyPlayerHandlers", () => {
  it("create-lobby rejects invalid username", async () => {
    const ws = makeWs();
    const ctx = makeCtx();

    await lobbyPlayerHandlers["create-lobby"]({ ws, data: { username: " " }, ctx });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Invalid username." }),
    );
  });

  it("create-lobby creates game, assigns host and sends initial snapshots", async () => {
    const ws = makeWs();
    const ctx = makeCtx();

    await lobbyPlayerHandlers["create-lobby"]({
      ws,
      data: { username: "alice", displayname: "Alice" },
      ctx,
    });

    const gameId = ws.gameId as string;
    const game = ctx.games[gameId] as GameState;
    expect(game).toBeTruthy();
    expect(game.host).toBe("alice");
    expect(game.inLobby).toBe(true);
    expect(game.players[0]).toMatchObject({ username: "alice", displayname: "Alice" });
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"lobby-created"'));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"lobby-state"'));
  });

  it("join-lobby rejects unknown lobby", async () => {
    const ws = makeWs();
    const ctx = makeCtx();

    await lobbyPlayerHandlers["join-lobby"]({
      ws,
      data: { gameId: "NOPE", username: "alice" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Lobby does not exist!" }),
    );
  });

  it("join-lobby reconnects existing username and broadcasts update", async () => {
    const ws = makeWs("ws-new");
    const game: GameState = {
      inLobby: true,
      host: "alice",
      players: [{ id: "old", username: "alice", displayname: "Alice", online: false }],
      categories: Array(11).fill("Category"),
    };
    const ctx = makeCtx({ games: { G1: game } });

    await lobbyPlayerHandlers["join-lobby"]({
      ws,
      data: { gameId: "G1", username: "alice", displayname: "Alice" },
      ctx,
    });

    expect(game.players[0]).toMatchObject({ id: "ws-new", online: true });
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"lobby-state"'));
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "G1",
      expect.objectContaining({ type: "player-list-update" }),
    );
  });

  it("join-lobby rejects invalid username for existing lobby", async () => {
    const ws = makeWs();
    const game: GameState = {
      inLobby: true,
      host: "alice",
      players: [],
      categories: Array(11).fill("Category"),
    };
    const ctx = makeCtx({ games: { G1: game } });

    await lobbyPlayerHandlers["join-lobby"]({ ws, data: { gameId: "G1", username: " " }, ctx });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Invalid username." }),
    );
  });

  it("join-lobby reconnects existing player by stable playerKey", async () => {
    const ws = makeWs("ws-join");
    const game: GameState = {
      inLobby: true,
      host: "alice",
      players: [
        { id: "old", username: "old-name", displayname: "Old", playerKey: "pk1", online: false },
      ],
      categories: Array(11).fill("Category"),
    };
    const ctx = makeCtx({ games: { G1: game } });

    await lobbyPlayerHandlers["join-lobby"]({
      ws,
      data: { gameId: "G1", username: "alice", displayname: "Alice", playerKey: "pk1" },
      ctx,
    });

    expect(game.players[0]).toMatchObject({
      id: "ws-join",
      username: "alice",
      displayname: "Alice",
      playerKey: "pk1",
      online: true,
    });
  });

  it("join-lobby adds brand new player and schedules empty-lobby cleanup watchdog", async () => {
    const ws = makeWs("ws-new-player");
    const game: GameState = {
      inLobby: true,
      host: "alice",
      players: [{ id: "h1", username: "alice", displayname: "Alice", online: true }],
      categories: Array(11).fill("Category"),
    };
    const ctx = makeCtx({ games: { G1: game } });

    await lobbyPlayerHandlers["join-lobby"]({
      ws,
      data: { gameId: "G1", username: "bob", displayname: "Bob" },
      ctx,
    });

    expect(game.players.map((p) => p.username)).toEqual(["alice", "bob"]);
    expect(ctx.scheduleLobbyCleanupIfEmpty).toHaveBeenCalledWith("G1");
  });

  it("join-lobby rejects new player when lobby is full", async () => {
    const ws = makeWs("ws-full");
    const game: GameState = {
      inLobby: true,
      host: "alice",
      players: [
        { id: "p1", username: "alice", displayname: "Alice", online: true },
        { id: "p2", username: "bob", displayname: "Bob", online: true },
        { id: "p3", username: "carol", displayname: "Carol", online: true },
        { id: "p4", username: "dan", displayname: "Dan", online: true },
        { id: "p5", username: "erin", displayname: "Erin", online: true },
      ],
      categories: Array(11).fill("Category"),
    };
    const ctx = makeCtx({ games: { G1: game } });

    await lobbyPlayerHandlers["join-lobby"]({
      ws,
      data: { gameId: "G1", username: "frank", displayname: "Frank" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Lobby is full (max 5 players)." }),
    );
    expect(game.players).toHaveLength(5);
    expect(ctx.buildLobbyState).not.toHaveBeenCalled();
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("leave-lobby removes player and reassigns host when current host leaves", async () => {
    const ws = makeWs("ws-1");
    const game: GameState = {
      inLobby: true,
      host: "alice",
      players: [
        { id: "ws-1", username: "alice", displayname: "Alice", playerKey: "pk1", online: true },
        { id: "ws-2", username: "bob", displayname: "Bob", playerKey: "pk2", online: true },
      ],
      categories: Array(11).fill("Category"),
    };
    const ctx = makeCtx({ games: { G1: game } });

    await lobbyPlayerHandlers["leave-lobby"]({
      ws,
      data: { gameId: "G1", username: "alice" },
      ctx,
    });

    expect(game.players.map((p) => p.username)).toEqual(["bob"]);
    expect(game.host).toBe("bob");
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "G1",
      expect.objectContaining({ type: "player-list-update", host: "bob" }),
    );
    expect(ctx.scheduleLobbyCleanupIfEmpty).toHaveBeenCalledWith("G1");
  });

  it("leave-lobby removes player by playerKey when username missing", async () => {
    const ws = makeWs("ws-1");
    const game: GameState = {
      inLobby: true,
      host: "alice",
      players: [
        { id: "ws-1", username: "alice", displayname: "Alice", playerKey: "pk1", online: true },
        { id: "ws-2", username: "bob", displayname: "Bob", playerKey: "pk2", online: true },
      ],
      categories: Array(11).fill("Category"),
    };
    const ctx = makeCtx({ games: { G1: game } });

    await lobbyPlayerHandlers["leave-lobby"]({
      ws,
      data: { gameId: "G1", playerKey: "pk2" },
      ctx,
    });

    expect(game.players.map((p) => p.username)).toEqual(["alice"]);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "G1",
      expect.objectContaining({ type: "player-list-update" }),
    );
  });

  it("leave-lobby uses ws.gameId fallback and no-ops if player id is missing", async () => {
    const ws = makeWs("unknown");
    ws.gameId = "G1";
    const game: GameState = {
      inLobby: true,
      host: "alice",
      players: [
        { id: "ws-1", username: "alice", displayname: "Alice", playerKey: "pk1", online: true },
      ],
      categories: Array(11).fill("Category"),
    };
    const ctx = makeCtx({ games: { G1: game } });

    await lobbyPlayerHandlers["leave-lobby"]({ ws, data: {}, ctx });

    expect(game.players).toHaveLength(1);
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it("leave-lobby cleans up immediately when host leaves and lobby becomes empty", async () => {
    const ws = makeWs("ws-1");
    const game: GameState = {
      inLobby: true,
      host: "alice",
      players: [
        { id: "ws-1", username: "alice", displayname: "Alice", playerKey: "pk1", online: true },
      ],
      categories: Array(11).fill("Category"),
    };
    const ctx = makeCtx({ games: { G1: game } });

    await lobbyPlayerHandlers["leave-lobby"]({
      ws,
      data: { gameId: "G1", username: "alice" },
      ctx,
    });

    expect(game.players).toHaveLength(0);
    expect(ctx.scheduleLobbyCleanupIfEmpty).toHaveBeenCalledWith("G1");
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });
});
