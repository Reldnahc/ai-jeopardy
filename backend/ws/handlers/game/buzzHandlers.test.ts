import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx, fireAndForget } from "../../../test/createCtx.js";
import { buzzHandlers } from "./buzzHandlers.js";

function makeWs(id = "ws-1"): SocketState {
  return { id, send: vi.fn(), gameId: "g1" } as unknown as SocketState;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [{ id: "ws-1", username: "alice", displayname: "Alice" }],
    clueState: { clueKey: "firstBoard:400:Q", lockedOut: {} },
    selectedClue: { value: 400, question: "Q", answer: "A" },
    activeBoard: "firstBoard",
    buzzerLocked: false,
    buzzed: null,
    buzzLockouts: {},
    _buzzMsgSeq: 0,
    ...overrides,
  };
}

function makeCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: { g1: game },
      playerStableId: vi.fn((p: { username?: string }) => p.username),
      fireAndForget,
      repos: {
        profiles: {
          incrementTotalBuzzes: vi.fn(async () => {}),
          incrementTimesBuzzed: vi.fn(async () => {}),
        },
      },
      broadcast: vi.fn(),
      aiHostSayByKey: vi.fn(async () => ({ assetId: "a1", ms: 0 })),
      clearAnswerWindow: vi.fn(),
      startGameTimer: vi.fn(),
      startAnswerWindow: vi.fn(),
      parseClueValue: vi.fn(() => 400),
      autoResolveAfterJudgement: vi.fn(async () => {}),
    },
    overrides,
  );
}

describe("buzzHandlers", () => {
  it("denies buzz if player already attempted current clue", async () => {
    const ws = makeWs();
    const game = makeGame({ clueState: { clueKey: "firstBoard:400:Q", lockedOut: { alice: true } } });
    const ctx = makeCtx(game);

    await buzzHandlers.buzz({ ws, data: { gameId: "g1" }, ctx });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "buzz-denied", reason: "already-attempted", lockoutUntil: 0 }),
    );
  });

  it("denies buzz when buzzer already claimed", async () => {
    const ws = makeWs();
    const game = makeGame({ buzzed: "bob" });
    const ctx = makeCtx(game);

    await buzzHandlers.buzz({ ws, data: { gameId: "g1" }, ctx });

    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining("\"reason\":\"already-buzzed\""),
    );
  });

  it("applies early lockout when buzzer is still locked", async () => {
    const ws = makeWs();
    const game = makeGame({ buzzerLocked: true });
    const ctx = makeCtx(game);

    await buzzHandlers.buzz({ ws, data: { gameId: "g1" }, ctx });

    expect(game.buzzLockouts?.alice).toBeTypeOf("number");
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("\"reason\":\"early\""));
  });

  it("accepts candidate and opens pending buzz collection window", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await buzzHandlers.buzz({
      ws,
      data: { gameId: "g1", estimatedServerBuzzAtMs: Date.now(), clientSeq: 3 },
      ctx,
    });

    expect(game.pendingBuzz).toBeTruthy();
    expect(game.pendingBuzz?.candidates).toHaveLength(1);
    expect(game.pendingBuzz?.candidates[0]).toMatchObject({
      playerUsername: "alice",
      playerDisplayname: "Alice",
      clientSeq: 3,
    });
    expect(ctx.repos.profiles.incrementTotalBuzzes).toHaveBeenCalledWith("alice");
  });
});
