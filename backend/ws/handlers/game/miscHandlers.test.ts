import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";
import { miscHandlers } from "./miscHandlers.js";

function makeWs() {
  return { id: "ws-1", send: vi.fn(), gameId: null } as unknown as SocketState;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    activeBoard: "firstBoard",
    players: [{ username: "alice", displayname: "Alice", online: true }],
    boardData: {
      firstBoard: {
        categories: [{ values: [{ value: 200, question: "Q1" }, { value: 400, question: "Q2" }] }],
      },
    },
    clearedClues: new Set<string>(),
    scores: { alice: 1000 },
    lobbySettings: { narrationEnabled: true },
    ...overrides,
  };
}

function makeCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: { g1: game },
      broadcast: vi.fn(),
      requireHost: vi.fn(() => true),
      cancelAutoUnlock: vi.fn(),
      doUnlockBuzzerAuthoritative: vi.fn(),
      checkBoardTransition: vi.fn(() => true),
      clearAnswerWindow: vi.fn(),
      submitWager: vi.fn(async () => {}),
      submitDrawing: vi.fn(async () => {}),
      submitWagerDrawing: vi.fn(async () => {}),
      ensureTtsAsset: vi.fn(async () => ({ id: "asset-1" })),
      repos: {},
      checkAllWagersSubmitted: vi.fn(),
      checkAllDrawingsSubmitted: vi.fn(),
    },
    overrides,
  );
}

describe("miscHandlers", () => {
  it("dd-snipe-next toggles flag and broadcasts state", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await miscHandlers["dd-snipe-next"]({ ws, data: { gameId: "g1", enabled: true }, ctx });

    expect(game.ddSnipeNext).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "dd-snipe-next-set", enabled: true });
  });

  it("update-score applies delta and broadcasts scores", async () => {
    const ws = makeWs();
    const game = makeGame({ scores: { alice: 1000 } });
    const ctx = makeCtx(game);

    await miscHandlers["update-score"]({
      ws,
      data: { gameId: "g1", username: "alice", delta: 200 },
      ctx,
    });

    expect(game.scores?.alice).toBe(1200);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "update-scores", scores: game.scores });
  });

  it("unlock-buzzer requires host and unlocks authoritatively", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await miscHandlers["unlock-buzzer"]({ ws, data: { gameId: "g1" }, ctx });

    expect(ctx.cancelAutoUnlock).toHaveBeenCalledWith(game);
    expect(ctx.doUnlockBuzzerAuthoritative).toHaveBeenCalledWith("g1", game, ctx);
  });

  it("lock-buzzer toggles lock and broadcasts for host", async () => {
    const ws = makeWs();
    const game = makeGame({ buzzerLocked: false });
    const ctx = makeCtx(game);

    await miscHandlers["lock-buzzer"]({ ws, data: { gameId: "g1" }, ctx });

    expect(game.buzzerLocked).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "buzzer-locked" });
  });

  it("reset-buzzer clears buzz state and broadcasts reset events", async () => {
    const ws = makeWs();
    const game = makeGame({
      buzzed: "alice",
      buzzerLocked: false,
      buzzLockouts: { alice: Date.now() + 1000 },
      timerVersion: 1,
      timerEndTime: Date.now() + 5000,
    });
    const ctx = makeCtx(game);

    await miscHandlers["reset-buzzer"]({ ws, data: { gameId: "g1" }, ctx });

    expect(game.buzzed).toBeNull();
    expect(game.buzzerLocked).toBe(true);
    expect(game.buzzLockouts).toEqual({});
    expect(game.timerEndTime).toBeNull();
    expect(game.timerVersion).toBe(2);
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "buzzer-ui-reset" });
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "buzzer-locked" });
    expect(ctx.broadcast).toHaveBeenCalledWith("g1", { type: "timer-end", timerVersion: 2 });
  });

  it("mark-all-complete marks active board clues and checks transition", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await miscHandlers["mark-all-complete"]({ ws, data: { gameId: "g1" }, ctx });

    expect(game.clearedClues?.has("200-Q1")).toBe(true);
    expect(game.clearedClues?.has("400-Q2")).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "cleared-clues-sync" }),
    );
    expect(ctx.checkBoardTransition).toHaveBeenCalledWith(game, "g1", ctx);
  });

  it("reveal-answer marks clue revealed and resets answer capture state", async () => {
    const ws = makeWs();
    const game = makeGame({
      phase: "ANSWER_CAPTURE",
      answeringPlayerKey: "alice",
      answerSessionId: "sess-1",
      answerClueKey: "firstBoard:200:Q1",
      selectedClue: { value: 200, question: "Q1", answer: "A1", isAnswerRevealed: false },
    });
    const ctx = makeCtx(game);

    await miscHandlers["reveal-answer"]({ ws, data: { gameId: "g1" }, ctx });

    expect(ctx.clearAnswerWindow).toHaveBeenCalledWith(game);
    expect(game.phase).toBeNull();
    expect(game.answeringPlayerKey).toBeNull();
    expect(game.answerSessionId).toBeNull();
    expect(game.answerClueKey).toBeNull();
    expect(game.selectedClue?.isAnswerRevealed).toBe(true);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-revealed" }),
    );
  });

  it("submit handlers delegate to game helpers", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await miscHandlers["submit-wager"]({ ws, data: { gameId: "g1", player: "alice", wager: 500 }, ctx });
    await miscHandlers["submit-drawing"]({ ws, data: { gameId: "g1", player: "alice", drawing: "img" }, ctx });
    await miscHandlers["submit-final-wager-drawing"]({
      ws,
      data: { gameId: "g1", player: "alice", drawing: "wager-img" },
      ctx,
    });

    expect(ctx.submitWager).toHaveBeenCalledWith(game, "g1", "alice", 500, ctx);
    expect(ctx.submitDrawing).toHaveBeenCalledWith(game, "g1", "alice", "img", ctx);
    expect(ctx.submitWagerDrawing).toHaveBeenCalledWith(game, "g1", "alice", "wager-img", ctx);
  });

  it("tts-ensure sends tts-ready with generated asset", async () => {
    const ws = makeWs();
    const game = makeGame({ lobbySettings: { narrationEnabled: true } });
    const ctx = makeCtx(game, {
      ensureTtsAsset: vi.fn(async () => ({ id: "asset-99" })),
    });

    await miscHandlers["tts-ensure"]({
      ws,
      data: { gameId: "g1", text: "hello", requestId: "r1" },
      ctx,
    });

    expect(ctx.ensureTtsAsset).toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "tts-ready",
        requestId: "r1",
        assetId: "asset-99",
        url: "/api/tts/asset-99",
      }),
    );
  });

  it("tts-ensure sends error when narration is disabled", async () => {
    const ws = makeWs();
    const game = makeGame({ lobbySettings: { narrationEnabled: false } });
    const ctx = makeCtx(game);

    await miscHandlers["tts-ensure"]({
      ws,
      data: { gameId: "g1", text: "hello", requestId: "r1" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "tts-error", requestId: "r1", message: "Narration disabled" }),
    );
  });

  it("tts-ensure sends generation error when asset creation fails", async () => {
    const ws = makeWs();
    const game = makeGame({ lobbySettings: { narrationEnabled: true } });
    const ctx = makeCtx(game, {
      ensureTtsAsset: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    await miscHandlers["tts-ensure"]({
      ws,
      data: { gameId: "g1", text: "hello", requestId: "r2" },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "tts-error", requestId: "r2", message: "Failed to generate narration" }),
    );
  });
});
