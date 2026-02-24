import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../../types/runtime.js";
import { createCtx } from "../../../test/createCtx.js";
import { answerHandlers } from "./answerHandlers.js";

function makeWs(): SocketState {
  return { id: "ws-1", send: vi.fn(), gameId: "g1" } as unknown as SocketState;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "ANSWER_CAPTURE",
    players: [{ id: "ws-1", username: "alice", displayname: "Alice" }],
    selectedClue: { value: "$400", question: "Capital of France?", answer: "Paris" },
    clueState: { clueKey: "firstBoard:400:Capital of France?" },
    answerSessionId: "sess-1",
    answeringPlayerUsername: "alice",
    lobbySettings: { sttProviderName: "openai" },
    ...overrides,
  };
}

function makeCtx(game: GameState, overrides: Record<string, unknown> = {}) {
  return createCtx(
    {
      games: { g1: game },
      autoResolveAfterJudgement: vi.fn(async () => {}),
      clearAnswerWindow: vi.fn(),
      broadcast: vi.fn(),
      transcribeAnswerAudio: vi.fn(async () => "Paris"),
      judgeClueAnswerFast: vi.fn(async () => ({ verdict: "correct" })),
      parseClueValue: vi.fn(() => 400),
    },
    overrides,
  );
}

describe("answerHandlers", () => {
  it("returns error and auto-resolves when phase is not answer capture", async () => {
    const ws = makeWs();
    const game = makeGame({ phase: "clue" });
    const ctx = makeCtx(game);

    await answerHandlers["answer-audio-blob"]({
      ws,
      data: { gameId: "g1", answerSessionId: "sess-1", dataBase64: Buffer.from("a").toString("base64") },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("\"type\":\"answer-error\""));
    expect(ctx.autoResolveAfterJudgement).toHaveBeenCalledWith(ctx, "g1", game, "alice", "incorrect");
  });

  it("returns error on stale answer session", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await answerHandlers["answer-audio-blob"]({
      ws,
      data: { gameId: "g1", answerSessionId: "old-session", dataBase64: Buffer.from("a").toString("base64") },
      ctx,
    });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("Stale or invalid answer session"));
    expect(ctx.autoResolveAfterJudgement).toHaveBeenCalledWith(ctx, "g1", game, "alice", "incorrect");
  });

  it("broadcasts transcript and result on successful judging", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game);

    await answerHandlers["answer-audio-blob"]({
      ws,
      data: {
        gameId: "g1",
        answerSessionId: "sess-1",
        mimeType: "audio/webm",
        dataBase64: Buffer.from("audio").toString("base64"),
      },
      ctx,
    });

    expect(ctx.clearAnswerWindow).toHaveBeenCalledWith(game);
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-capture-ended", answerSessionId: "sess-1" }),
    );
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-transcript", transcript: "Paris", isFinal: true }),
    );
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-result", verdict: "correct", suggestedDelta: 400 }),
    );
    expect(ctx.autoResolveAfterJudgement).toHaveBeenCalledWith(ctx, "g1", game, "alice", "correct");
  });

  it("handles empty transcript as incorrect immediately", async () => {
    const ws = makeWs();
    const game = makeGame();
    const ctx = makeCtx(game, {
      transcribeAnswerAudio: vi.fn(async () => ""),
    });

    await answerHandlers["answer-audio-blob"]({
      ws,
      data: {
        gameId: "g1",
        answerSessionId: "sess-1",
        mimeType: "audio/webm",
        dataBase64: Buffer.from("audio").toString("base64"),
      },
      ctx,
    });

    expect(ctx.broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-result", verdict: "incorrect", suggestedDelta: -400 }),
    );
    expect(ctx.autoResolveAfterJudgement).toHaveBeenCalledWith(ctx, "g1", game, "alice", "incorrect");
  });
});
