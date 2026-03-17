import { describe, expect, it } from "vitest";
import type { GameState } from "../../types/runtime.js";
import {
  buildAiHostPlaybackHydration,
  buildGameStatePayload,
  findPlayerByUsername,
  joinPlayerFromProfile,
  normalizeSessionUsername,
  removePlayerFromGame,
} from "./sessionState.js";

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

describe("sessionState", () => {
  it("normalizes usernames and reconnects players by that normalized value", () => {
    const game = makeGame({
      players: [{ id: "old", username: "Alice", displayname: "Old", online: false }],
    });

    const player = joinPlayerFromProfile(game, {
      wsId: "ws-1",
      username: normalizeSessionUsername("  ALICE "),
      displayname: "Alice",
    });

    expect(findPlayerByUsername(game, "alice")).toBe(player);
    expect(player).toMatchObject({ id: "ws-1", username: "Alice", displayname: "Alice" });
    expect(player.online).toBe(true);
  });

  it("creates a player from profile defaults when none exists", () => {
    const game = makeGame();

    const player = joinPlayerFromProfile(game, {
      wsId: "ws-1",
      username: "alice",
      displayname: "",
      profile: { displayname: "Alice", color: "bg-red-500", text_color: "text-black" },
    });

    expect(player).toMatchObject({
      id: "ws-1",
      username: "alice",
      displayname: "Alice",
      color: "bg-red-500",
      text_color: "text-black",
      online: true,
    });
  });

  it("builds a join snapshot with DD modal and active host playback metadata", () => {
    const now = Date.now();
    const game = makeGame({
      players: [{ id: "ws-1", username: "alice", displayname: "Alice" }],
      buzzLockouts: { alice: now + 1000 },
      phase: "DD_WAGER_CAPTURE",
      dailyDouble: {
        clueKey: "firstBoard:400:Q",
        playerUsername: "alice",
        playerDisplayname: "Alice",
        maxWager: 1200,
      },
      aiHostPlayback: {
        assetId: "asset-1",
        startedAtMs: now - 500,
        durationMs: 5000,
      },
    });

    const payload = buildGameStatePayload("g1", game, game.players?.[0] || null, now);

    expect(payload.playerBuzzLockoutUntil).toBe(now + 1000);
    expect(payload.ddShowModal).toEqual({ playerUsername: "alice", maxWager: 1200 });
    expect(payload.aiHostPlayback).toMatchObject({
      assetId: "asset-1",
      startedAtMs: now - 500,
      durationMs: 5000,
      elapsedMs: 500,
    });
  });

  it("drops stale ai host playback hydration", () => {
    const now = Date.now();
    const game = makeGame({
      aiHostPlayback: {
        assetId: "asset-1",
        startedAtMs: now - 20_000,
      },
    });

    expect(buildAiHostPlaybackHydration(game, now)).toBeNull();
  });

  it("removes a leaving player and cleans their stored game state", () => {
    const game = makeGame({
      players: [
        { id: "ws-1", username: "alice", displayname: "Alice" },
        { id: "ws-2", username: "bob", displayname: "Bob" },
      ],
      scores: { alice: 100, bob: 200 },
      wagers: { alice: 10, bob: 20 },
      drawings: { alice: "a", bob: "b" },
      finalWagerDrawings: { alice: "fa", bob: "fb" },
      buzzLockouts: { alice: 1, bob: 2 },
    });

    const removed = removePlayerFromGame(game, "alice", "ws-1");

    expect(removed?.username).toBe("alice");
    expect(game.players?.map((player) => player.username)).toEqual(["bob"]);
    expect(game.scores?.alice).toBeUndefined();
    expect(game.wagers?.alice).toBeUndefined();
    expect(game.drawings?.alice).toBeUndefined();
    expect(game.finalWagerDrawings?.alice).toBeUndefined();
    expect(game.buzzLockouts?.alice).toBeUndefined();
  });
});
