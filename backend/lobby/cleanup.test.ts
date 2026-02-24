import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { games } from "../state/gamesStore.js";
import {
  LOBBY_EMPTY_GRACE_MS,
  cancelLobbyCleanup,
  scheduleLobbyCleanupIfEmpty,
} from "./cleanup.js";

describe("lobby cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const k of Object.keys(games)) delete games[k];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancelLobbyCleanup clears timer and emptySince", () => {
    const timer = setTimeout(() => {}, 1000);
    const game = { cleanupTimer: timer, emptySince: Date.now() } as never;
    cancelLobbyCleanup(game);
    expect(game.cleanupTimer).toBeNull();
    expect(game.emptySince).toBeNull();
  });

  it("schedules and deletes empty lobby after grace period", () => {
    games.g1 = {
      inLobby: true,
      players: [{ username: "alice", online: false }],
      cleanupTimer: null,
      emptySince: null,
    } as never;

    scheduleLobbyCleanupIfEmpty("g1");
    expect(games.g1?.cleanupTimer).toBeTruthy();
    expect(typeof games.g1?.emptySince).toBe("number");

    vi.advanceTimersByTime(LOBBY_EMPTY_GRACE_MS + 1);
    expect(games.g1).toBeUndefined();
  });

  it("does not schedule for non-empty lobbies and clears stale timer", () => {
    const timer = setTimeout(() => {}, 1000);
    games.g2 = {
      inLobby: true,
      players: [{ username: "alice", online: true }],
      cleanupTimer: timer,
      emptySince: Date.now(),
    } as never;

    scheduleLobbyCleanupIfEmpty("g2");
    expect(games.g2?.cleanupTimer).toBeNull();
    expect(games.g2?.emptySince).toBeNull();
  });

  it("keeps game when someone reconnects before timer fires", () => {
    games.g3 = {
      inLobby: true,
      players: [{ username: "alice", online: false }],
      cleanupTimer: null,
      emptySince: null,
    } as never;

    scheduleLobbyCleanupIfEmpty("g3");
    games.g3.players[0].online = true;
    vi.advanceTimersByTime(LOBBY_EMPTY_GRACE_MS + 1);

    expect(games.g3).toBeTruthy();
    expect(games.g3.cleanupTimer).toBeNull();
    expect(games.g3.emptySince).toBeNull();
  });
});

