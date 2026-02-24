import { beforeEach, describe, expect, it, vi } from "vitest";
import { games } from "../state/gamesStore.js";
import { buildLobbyState, getPlayerForSocket, sendLobbySnapshot } from "./snapshot.js";

describe("lobby snapshot", () => {
  beforeEach(() => {
    for (const k of Object.keys(games)) delete games[k];
  });

  it("buildLobbyState returns null when game is missing", () => {
    const out = buildLobbyState("missing", { id: "s1", send: vi.fn() } as never);
    expect(out).toBeNull();
  });

  it("buildLobbyState shapes payload and resolves current player", () => {
    games.g1 = {
      host: "Alice",
      players: [
        { id: "s1", username: "alice", displayname: "Alice", online: true },
        { id: "s2", username: "bob", displayname: "Bob", online: false },
      ],
      categories: ["A", "B"],
      lockedCategories: [false],
      inLobby: true,
      lobbySettings: { sttProviderName: "openai" },
      isGenerating: 1,
      isLoading: 0,
      generationProgress: 10,
      generationDone: 1,
      generationTotal: 11,
    } as never;

    const out = buildLobbyState("g1", { id: "s1", send: vi.fn() } as never);
    expect(out?.type).toBe("lobby-state");
    expect(out?.players[1]?.online).toBe(false);
    expect(out?.categories.length).toBe(11);
    expect(out?.you?.isHost).toBe(true);
  });

  it("getPlayerForSocket and sendLobbySnapshot handle null and send", () => {
    expect(getPlayerForSocket(null as never, null as never)).toBeNull();

    games.g1 = {
      host: "alice",
      players: [{ id: "s1", username: "alice", displayname: "Alice", online: true }],
      categories: [],
      lockedCategories: [],
      inLobby: true,
    } as never;

    const ws = { id: "s1", send: vi.fn() };
    const player = getPlayerForSocket(games.g1 as never, ws as never);
    expect(player?.username).toBe("alice");

    sendLobbySnapshot(ws as never, "g1");
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(String(ws.send.mock.calls[0][0])).toContain("\"type\":\"lobby-state\"");
  });
});

