import { describe, expect, it, vi } from "vitest";
import type { GameState, SocketState } from "../../types/runtime.js";
import { createCtx } from "../../test/createCtx.js";
import { userHandlers } from "./userHandlers.js";

function makeWs(): SocketState {
  return { id: "ws-1", send: vi.fn(), gameId: "g1", auth: undefined } as unknown as SocketState;
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  const game: GameState = {
    host: "alice",
    players: [{ username: "alice", displayname: "Alice", online: true }],
  };

  return createCtx(
    {
      verifyJwt: vi.fn(() => ({ sub: "u1", role: "admin" })),
      repos: { profiles: { getRoleById: vi.fn(async () => "host") } },
      getCOTD: vi.fn(() => "Science"),
      games: { g1: game },
    },
    overrides,
  );
}

describe("userHandlers", () => {
  it("ping sends pong", async () => {
    const ws = makeWs();

    await userHandlers.ping({ ws, data: {}, ctx: createCtx() });

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("\"type\":\"pong\""));
  });

  it("request-time-sync echoes client timestamp with serverNow", async () => {
    const ws = makeWs();

    await userHandlers["request-time-sync"]({ ws, data: { clientSentAt: 123 }, ctx: createCtx() });

    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"send-time-sync\""),
    );
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("\"clientSentAt\":123"));
  });

  it("auth without token marks socket unauthenticated", async () => {
    const ws = makeWs();
    const ctx = makeCtx();

    await userHandlers.auth({ ws, data: {}, ctx });

    expect(ws.auth).toEqual({ isAuthed: false, userId: null, role: "default" });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "auth-result", ok: false }));
  });

  it("auth with valid token prefers DB role and sets auth state", async () => {
    const ws = makeWs();
    const ctx = makeCtx({
      verifyJwt: vi.fn(() => ({ sub: "u1", role: "admin" })),
      repos: { profiles: { getRoleById: vi.fn(async () => "creator") } },
    });

    await userHandlers.auth({ ws, data: { token: "jwt" }, ctx });

    expect(ws.auth).toEqual({ isAuthed: true, userId: "u1", role: "creator" });
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "auth-result", ok: true, role: "creator", userId: "u1" }),
    );
  });

  it("check-cotd returns category of the day", async () => {
    const ws = makeWs();
    const ctx = makeCtx({ getCOTD: vi.fn(() => "History") });

    await userHandlers["check-cotd"]({ ws, data: {}, ctx });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "category-of-the-day", cotd: "History" }),
    );
  });

  it("request-player-list sends players and host for game", async () => {
    const ws = makeWs();
    const ctx = makeCtx();

    await userHandlers["request-player-list"]({ ws, data: { gameId: "g1" }, ctx });

    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining("\"type\":\"player-list-update\""),
    );
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("\"host\":\"alice\""));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("\"username\":\"alice\""));
  });
});
