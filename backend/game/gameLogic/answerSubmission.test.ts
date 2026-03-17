import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../types/runtime.js";
import {
  applyAnswerResult,
  beginAnswerJudging,
  buildAnswerResultPayload,
  createAnswerErrorPayload,
  resolveSuggestedDelta,
  validateAnswerSubmission,
} from "./answerSubmission.js";

function makeWs(): SocketState {
  return { id: "ws-1", send: vi.fn(), gameId: "g1" } as unknown as SocketState;
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: "ANSWER_CAPTURE",
    players: [{ id: "ws-1", username: "alice", displayname: "Alice" }],
    selectedClue: { value: "$400", question: "Capital?", answer: "Paris", category: "Geo" },
    clueState: { clueKey: "firstBoard:400:Capital?" },
    answerSessionId: "sess-1",
    answeringPlayerUsername: "alice",
    lobbySettings: { sttProviderName: "openai" },
    ...overrides,
  };
}

describe("answerSubmission helpers", () => {
  it("creates answer error payloads", () => {
    expect(
      createAnswerErrorPayload({
        gameId: "g1",
        answerSessionId: "sess-1",
        message: "bad",
      }),
    ).toEqual({
      type: "answer-error",
      gameId: "g1",
      answerSessionId: "sess-1",
      message: "bad",
    });
  });

  it("validates answer phase, session, player, and audio payloads", () => {
    const ws = makeWs();

    expect(
      validateAnswerSubmission({
        game: makeGame({ phase: "clue" }),
        ws,
        gameId: "g1",
        answerSessionId: "sess-1",
        dataBase64: Buffer.from("a").toString("base64"),
      }),
    ).toMatchObject({ ok: false });

    expect(
      validateAnswerSubmission({
        game: makeGame(),
        ws,
        gameId: "g1",
        answerSessionId: "old",
        dataBase64: Buffer.from("a").toString("base64"),
      }),
    ).toMatchObject({ ok: false });

    expect(
      validateAnswerSubmission({
        game: makeGame({ answeringPlayerUsername: "bob" }),
        ws,
        gameId: "g1",
        answerSessionId: "sess-1",
        dataBase64: Buffer.from("a").toString("base64"),
      }),
    ).toMatchObject({ ok: false });

    expect(
      validateAnswerSubmission({
        game: makeGame(),
        ws,
        gameId: "g1",
        answerSessionId: "sess-1",
        dataBase64: "",
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects invalid or oversized audio and returns decoded buffers on success", () => {
    const ws = makeWs();
    const bufferFromSpy = vi.spyOn(Buffer, "from").mockImplementationOnce(() => {
      throw new Error("bad");
    });

    expect(
      validateAnswerSubmission({
        game: makeGame(),
        ws,
        gameId: "g1",
        answerSessionId: "sess-1",
        dataBase64: "bad",
      }),
    ).toMatchObject({ ok: false });
    bufferFromSpy.mockRestore();

    expect(
      validateAnswerSubmission({
        game: makeGame(),
        ws,
        gameId: "g1",
        answerSessionId: "sess-1",
        dataBase64: Buffer.alloc(16, 1).toString("base64"),
        maxBytes: 8,
      }),
    ).toMatchObject({ ok: false });

    const success = validateAnswerSubmission({
      game: makeGame(),
      ws,
      gameId: "g1",
      answerSessionId: "sess-1",
      dataBase64: Buffer.from("audio").toString("base64"),
    });

    expect(success).toMatchObject({
      ok: true,
      playerUsername: "alice",
      playerDisplayname: "Alice",
    });
    if (success.ok) {
      expect(success.buffer.toString()).toBe("audio");
    }
  });

  it("begins judging and applies result state consistently", () => {
    const game = makeGame();
    const clearAnswerWindow = vi.fn();
    const broadcast = vi.fn();

    beginAnswerJudging({
      game,
      gameId: "g1",
      answerSessionId: "sess-1",
      playerUsername: "alice",
      playerDisplayname: "Alice",
      clearAnswerWindow,
      broadcast,
    });

    expect(clearAnswerWindow).toHaveBeenCalledWith(game);
    expect(game.phase).toBe("JUDGING");
    expect(broadcast).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ type: "answer-capture-ended", answerSessionId: "sess-1" }),
    );

    applyAnswerResult({
      game,
      verdict: "incorrect",
      transcript: "",
      confidence: 0,
    });

    expect(game.phase).toBe("RESULT");
    expect(game.answerVerdict).toBe("incorrect");
    expect(game.answerTranscript).toBe("");
    expect(game.answerConfidence).toBe(0);
  });

  it("computes suggested deltas from clue value or active dd wager and builds payloads", () => {
    const regularGame = makeGame();
    const ddGame = makeGame({
      dailyDouble: {
        clueKey: "firstBoard:400:Capital?",
        playerUsername: "alice",
        playerDisplayname: "Alice",
        wager: 1200,
      },
    });

    expect(resolveSuggestedDelta(regularGame, "correct")).toBe(400);
    expect(resolveSuggestedDelta(regularGame, "incorrect")).toBe(-400);
    expect(resolveSuggestedDelta(ddGame, "incorrect")).toBe(-1200);
    expect(resolveSuggestedDelta(regularGame, "pass")).toBe(0);

    expect(
      buildAnswerResultPayload({
        gameId: "g1",
        answerSessionId: "sess-1",
        playerUsername: "alice",
        playerDisplayname: "Alice",
        transcript: "Paris",
        verdict: "correct",
        suggestedDelta: 400,
        confidence: 0.9,
      }),
    ).toEqual({
      type: "answer-result",
      gameId: "g1",
      answerSessionId: "sess-1",
      username: "alice",
      displayname: "Alice",
      transcript: "Paris",
      verdict: "correct",
      confidence: 0.9,
      suggestedDelta: 400,
    });
  });
});
