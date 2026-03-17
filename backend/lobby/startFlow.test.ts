import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../types/runtime.js";
import {
  acknowledgeGameReady,
  acknowledgePreloadDone,
  activateGameReadyHandshake,
  chooseStartingSelector,
  clearWelcomeTimer,
  enterBoardPhase,
  enterWelcomePhase,
  getRequiredStableIds,
  resetLobbyStartPhase,
} from "./startFlow.js";

function stableId(player: { username?: string | null }) {
  return String(player.username ?? "")
    .trim()
    .toLowerCase();
}

describe("startFlow helpers", () => {
  it("chooses from online players before falling back to offline entries", () => {
    const game = {
      players: [
        { username: "offline", displayname: "Offline", online: false },
        { username: "alice", displayname: "Alice", online: true },
      ],
    } as GameState;

    const pick = chooseStartingSelector(game, () => 0);

    expect(pick?.username).toBe("alice");
    expect(game.selectorKey).toBe("alice");
    expect(game.selectorName).toBe("Alice");
  });

  it("falls back to the full player list when nobody is online", () => {
    const game = {
      players: [{ username: "alice", displayname: "Alice", online: false }],
    } as GameState;

    chooseStartingSelector(game, () => 0);

    expect(game.selectorKey).toBe("alice");
    expect(game.selectorName).toBe("Alice");
  });

  it("builds required stable ids from online players only", () => {
    const game = {
      players: [
        { username: "host", online: true },
        { username: "alice", online: true },
        { username: "ghost", online: false },
      ],
    } as GameState;

    expect(getRequiredStableIds(game, stableId)).toEqual(["host", "alice"]);
  });

  it("records preload acknowledgements and resolves once all required players match the final token", () => {
    const game = {
      players: [
        { username: "host", online: true },
        { username: "alice", online: true },
      ],
      preload: {
        finalToken: 3,
        requiredForToken: [],
        acksByPlayer: {},
      },
    } as GameState;

    expect(
      acknowledgePreloadDone({ game, stableId: "host", token: 3, playerStableId: stableId }),
    ).toBe(false);
    expect(
      acknowledgePreloadDone({ game, stableId: "alice", token: 3, playerStableId: stableId }),
    ).toBe(true);
    expect(game.preload?.requiredForToken).toEqual(["host", "alice"]);
  });

  it("activates the game-ready handshake and swaps the visible host to AI Jeopardy", () => {
    const game = {
      host: "host",
      inLobby: true,
      isLoading: true,
      players: [
        { username: "host", online: true },
        { username: "alice", online: true },
      ],
      preload: {
        active: true,
      },
    } as GameState;

    activateGameReadyHandshake(game, stableId);

    expect(game.preload?.active).toBe(false);
    expect(game.inLobby).toBe(false);
    expect(game.isLoading).toBe(false);
    expect(game.lobbyHost).toBe("host");
    expect(game.host).toBe("AI Jeopardy");
    expect(game.gameReady).toEqual({
      expected: { host: true, alice: true },
      acks: {},
      done: false,
    });
    expect(game.phase).toBeNull();
  });

  it("marks game-ready acknowledgements and finishes when all expected players confirm", () => {
    const game = {
      gameReady: {
        expected: { host: true, alice: true },
        acks: {},
        done: false,
      },
    } as GameState;

    expect(acknowledgeGameReady(game, "host")).toBe(false);
    expect(game.gameReady?.done).toBe(false);
    expect(acknowledgeGameReady(game, "alice")).toBe(true);
    expect(game.gameReady?.done).toBe(true);
  });

  it("clears the welcome timer and resets lobby start phase fields", () => {
    vi.useFakeTimers();
    const timer = setTimeout(() => {}, 1000);
    const game = {
      phase: "welcome",
      welcomeEndsAt: Date.now() + 1000,
      welcomeTimer: timer,
    } as GameState;

    resetLobbyStartPhase(game);

    expect(game.phase).toBeNull();
    expect(game.welcomeEndsAt).toBeNull();
    expect(game.welcomeTimer).toBeNull();
    vi.useRealTimers();
  });

  it("updates phase helpers for welcome and board states", () => {
    const game = {} as GameState;

    enterWelcomePhase(game);
    expect(game.phase).toBe("welcome");

    enterBoardPhase(game);
    expect(game.phase).toBe("board");
    expect(game.welcomeEndsAt).toBeNull();
  });

  it("clears the welcome timer directly", () => {
    vi.useFakeTimers();
    const timer = setTimeout(() => {}, 1000);
    const game = { welcomeTimer: timer } as GameState;

    clearWelcomeTimer(game);

    expect(game.welcomeTimer).toBeNull();
    vi.useRealTimers();
  });
});
