import { describe, expect, it, vi } from "vitest";
import { sendLobbyErrorAndSnapshot, sendSocketError } from "./socketErrors.js";

describe("socket error helpers", () => {
  it("sendSocketError serializes the standard error payload", () => {
    const ws = { send: vi.fn() } as never;

    sendSocketError(ws, "bad request", { code: 400 });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "bad request", code: 400 }),
    );
  });

  it("sendLobbyErrorAndSnapshot sends the error and refreshes the lobby snapshot", () => {
    const ws = { send: vi.fn() } as never;
    const sendLobbySnapshot = vi.fn();

    sendLobbyErrorAndSnapshot({
      ws,
      gameId: "g1",
      sendLobbySnapshot,
      message: "locked",
    });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "error", message: "locked" }));
    expect(sendLobbySnapshot).toHaveBeenCalledWith(ws, "g1");
  });
});
