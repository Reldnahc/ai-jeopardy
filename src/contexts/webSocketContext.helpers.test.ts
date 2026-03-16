import { describe, expect, it } from "vitest";
import {
  buildTimeSyncRequest,
  getTimeSyncOffsets,
  isLiveSocket,
  isTimeSyncMessage,
  parseSocketMessage,
  shouldReconnectSocket,
} from "./webSocketContext.helpers.ts";

describe("webSocketContext helpers", () => {
  it("parses valid socket messages and rejects invalid payloads", () => {
    expect(parseSocketMessage(JSON.stringify({ type: "ping", value: 1 }))).toEqual({
      type: "ping",
      value: 1,
    });
    expect(parseSocketMessage("{")).toBeNull();
    expect(parseSocketMessage(JSON.stringify({ nope: true }))).toBeNull();
    expect(parseSocketMessage(123)).toBeNull();
  });

  it("builds time sync requests with both date and performance timestamps", () => {
    expect(buildTimeSyncRequest(45.5, 1234)).toEqual({
      type: "request-time-sync",
      clientSentAt: 1234,
      clientSentPerf: 45.5,
    });
  });

  it("detects time sync messages and computes midpoint offsets", () => {
    const message = {
      type: "send-time-sync" as const,
      clientSentAt: 10,
      clientSentPerf: 12,
      serverNow: 70,
    };

    expect(isTimeSyncMessage(message)).toBe(true);
    expect(
      getTimeSyncOffsets({
        message,
        clientRecvAt: 30,
        clientRecvPerf: 28,
      }),
    ).toEqual({
      offsetMs: 50,
      offsetPerfMs: 50,
      lastSyncPerf: 28,
    });
  });

  it("uses socket ready state helpers without requiring a browser websocket object", () => {
    expect(isLiveSocket({ readyState: 0 })).toBe(true);
    expect(isLiveSocket({ readyState: 1 })).toBe(true);
    expect(isLiveSocket({ readyState: 3 })).toBe(false);

    expect(shouldReconnectSocket(null)).toBe(true);
    expect(shouldReconnectSocket({ readyState: 3 })).toBe(true);
    expect(shouldReconnectSocket({ readyState: 1 })).toBe(false);
  });
});
