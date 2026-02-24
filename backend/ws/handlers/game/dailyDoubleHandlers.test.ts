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
  it("no-ops when game is missing", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, { games: {} });

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "missing", ddWagerSessionId: "dd-1", dataBase64: Buffer.from("a").toString("base64") },
      ctx,
    });

    expect(ws.send).not.toHaveBeenCalled();
  });

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

  it("returns error when caller is not DD player", async () => {
    const ws = makeWs();
    const game = makeGame({ dailyDouble: { ...makeGame().dailyDouble!, playerUsername: "bob" } });
    const ctx = makeCtx(game);

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "g1", ddWagerSessionId: "dd-1", dataBase64: Buffer.from("a").toString("base64") },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("You are not the Daily Double player"));
  });

  it("returns error when audio payload is missing", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "g1", ddWagerSessionId: "dd-1", dataBase64: "" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Missing audio data"));
  });

  it("returns error when base64 decode throws", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);
    const bufferFromSpy = vi.spyOn(Buffer, "from").mockImplementationOnce(() => {
      throw new Error("bad");
    });

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "g1", ddWagerSessionId: "dd-1", dataBase64: "bad" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Invalid base64 audio"));
    bufferFromSpy.mockRestore();
  });

  it("returns error when audio payload is too large", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);
    const hugeBase64 = Buffer.alloc(2_000_001, 1).toString("base64");

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "g1", ddWagerSessionId: "dd-1", dataBase64: hugeBase64 },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Audio too large"));
  });

  it("returns STT failure error and does not parse wager", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, {
      transcribeAnswerAudio: vi.fn(async () => {
        throw new Error("stt");
      }),
    });

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "g1", ddWagerSessionId: "dd-1", dataBase64: Buffer.from("a").toString("base64") },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("STT failed"));
    expect(ctx.parseDailyDoubleWager).not.toHaveBeenCalled();
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

  it("reprompts with fallback reason when parser returns null reason", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, {
      parseDailyDoubleWager: vi.fn(async () => ({ wager: null, reason: null })),
    });

    await dailyDoubleHandlers["daily-double-wager-audio-blob"]({
      ws,
      data: { gameId: "g1", ddWagerSessionId: "dd-1", dataBase64: Buffer.from("a").toString("base64") },
      ctx,
    });

    expect(ctx.repromptDdWager).toHaveBeenCalledWith("g1", game, ctx, { reason: "no-number" });
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
