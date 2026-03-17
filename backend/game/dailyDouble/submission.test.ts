import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../types/runtime.js";
import {
  createDailyDoubleErrorPayload,
  validateDailyDoubleSubmission,
} from "./submission.js";

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
    },
    ...overrides,
  } as GameState;
}

describe("dailyDouble submission helpers", () => {
  it("builds daily double error payloads", () => {
    expect(
      createDailyDoubleErrorPayload({
        gameId: "g1",
        ddWagerSessionId: "dd-1",
        message: "bad",
      }),
    ).toEqual({
      type: "daily-double-error",
      gameId: "g1",
      ddWagerSessionId: "dd-1",
      message: "bad",
    });
  });

  it("rejects invalid phase, session, player, and missing audio", () => {
    const ws = makeWs();

    expect(
      validateDailyDoubleSubmission({
        game: makeGame({ phase: "clue" }),
        ws,
        gameId: "g1",
        ddWagerSessionId: "dd-1",
        dataBase64: Buffer.from("a").toString("base64"),
      }),
    ).toMatchObject({ ok: false });

    expect(
      validateDailyDoubleSubmission({
        game: makeGame(),
        ws,
        gameId: "g1",
        ddWagerSessionId: "old",
        dataBase64: Buffer.from("a").toString("base64"),
      }),
    ).toMatchObject({ ok: false });

    expect(
      validateDailyDoubleSubmission({
        game: makeGame({
          dailyDouble: { ...makeGame().dailyDouble!, playerUsername: "bob" },
        }),
        ws,
        gameId: "g1",
        ddWagerSessionId: "dd-1",
        dataBase64: Buffer.from("a").toString("base64"),
      }),
    ).toMatchObject({ ok: false });

    expect(
      validateDailyDoubleSubmission({
        game: makeGame(),
        ws,
        gameId: "g1",
        ddWagerSessionId: "dd-1",
        dataBase64: "",
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects invalid or oversized audio payloads", () => {
    const ws = makeWs();
    const bufferFromSpy = vi.spyOn(Buffer, "from").mockImplementationOnce(() => {
      throw new Error("bad");
    });

    expect(
      validateDailyDoubleSubmission({
        game: makeGame(),
        ws,
        gameId: "g1",
        ddWagerSessionId: "dd-1",
        dataBase64: "bad",
      }),
    ).toMatchObject({ ok: false });
    bufferFromSpy.mockRestore();

    expect(
      validateDailyDoubleSubmission({
        game: makeGame(),
        ws,
        gameId: "g1",
        ddWagerSessionId: "dd-1",
        dataBase64: Buffer.alloc(16, 1).toString("base64"),
        maxBytes: 8,
      }),
    ).toMatchObject({ ok: false });
  });

  it("returns normalized player identity and decoded audio on success", () => {
    const result = validateDailyDoubleSubmission({
      game: makeGame(),
      ws: makeWs(),
      gameId: "g1",
      ddWagerSessionId: "dd-1",
      dataBase64: Buffer.from("audio").toString("base64"),
    });

    expect(result).toMatchObject({
      ok: true,
      playerUsername: "alice",
      playerDisplayname: "Alice",
    });
    if (result.ok) {
      expect(result.buffer.toString()).toBe("audio");
    }
  });
});
