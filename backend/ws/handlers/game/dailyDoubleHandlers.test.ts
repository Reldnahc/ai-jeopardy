import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";
import { dailyDoubleHandlers } from "./dailyDoubleHandlers.js";

function makeWs(): SocketState {
  return { id: "ws-1", send: vi.fn(), gameId: "g1" } as unknown as SocketState;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "DD_WAGER_CAPTURE",
    ddWagerSessionId: "dd-1",
    players: [{ id: "ws-1", username: "alice", displayname: "Alice" }],
    dailyDouble: {
      clueKey: "firstBoard:400:Q",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      maxWager: 1200,
      stage: "wager_listen",
      wager: null,
      attempts: 0,
    },
    lobbySettings: { sttProviderName: "openai" },
    ...overrides,
  };
}

function makeCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: { g1: game },
      clearDdWagerTimer: vi.fn(),
      transcribeAnswerAudio: vi.fn(async () => "700"),
      parseDailyDoubleWager: vi.fn(async () => ({ wager: 700, reason: "ok" })),
      broadcast: vi.fn(),
      repromptDdWager: vi.fn(async () => {}),
      finalizeDailyDoubleWagerAndStartClue: vi.fn(async () => {}),
    },
    overrides,
  );
}

describe("dailyDoubleHandlers", () => {
  it("returns error when not in DD wager phase", async () => {
    const ws = makeWs();
    const game = makeGame({ phase: "clue" });
    const ctx = makeCtx(game);

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "g1", ddWagerSessionId: "dd-1", dataBase64: Buffer.from("a").toString("base64") },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Not accepting DD wagers right now"));
    expect(ctx.clearDdWagerTimer).not.toHaveBeenCalled();
  });

  it("returns error on stale DD wager session", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "g1", ddWagerSessionId: "old", dataBase64: Buffer.from("a").toString("base64") },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Stale or invalid DD wager session"));
  });

  it("reprompts when parsed wager is null", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, {
      parseDailyDoubleWager: vi.fn(async () => ({ wager: null, reason: "no-number" })),
    });

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "g1", ddWagerSessionId: "dd-1", dataBase64: Buffer.from("a").toString("base64") },
      ctx,
    });

    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "daily-double-wager-heard", parsedWager: null }),
    );
    expect(ctx.repromptDdWager).toHaveBeenCalledWith("g1", game, ctx, { reason: "no-number" });
    expect(ctx.finalizeDailyDoubleWagerAndStartClue).not.toHaveBeenCalled();
  });

  it("locks and finalizes wager on successful parse", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: {
        gameId: "g1",
        ddWagerSessionId: "dd-1",
        mimeType: "audio/webm",
        dataBase64: Buffer.from("audio").toString("base64"),
      },
      ctx,
    });

    expect(game.dailyDouble?.wager).toBe(700);
    expect(game.phase).toBe("clue");
    expect(game.ddWagerSessionId).toBeNull();
    expect(game.usedDailyDoubles?.has("firstBoard:400:Q")).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "daily-double-wager-locked", wager: 700 }),
    );
    expect(ctx.finalizeDailyDoubleWagerAndStartClue).toHaveBeenCalledWith("g1", game, ctx, {
      wager: 700,
      fallback: false,
      reason: null,
    });
  });
});
