import type { TimeSyncMessage, WSMessage } from "./webSocketContext.types.ts";

type SocketReadyState = Pick<WebSocket, "readyState">;
const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;
const SOCKET_CLOSED = 3;

export function getPerfNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

export function isLiveSocket(ws: SocketReadyState | null | undefined): boolean {
  return Boolean(ws && (ws.readyState === SOCKET_OPEN || ws.readyState === SOCKET_CONNECTING));
}

export function shouldReconnectSocket(ws: SocketReadyState | null | undefined): boolean {
  return !ws || ws.readyState === SOCKET_CLOSED;
}

export function buildTimeSyncRequest(perfNowMs: number, dateNow: number = Date.now()) {
  return {
    type: "request-time-sync" as const,
    clientSentAt: dateNow,
    clientSentPerf: perfNowMs,
  };
}

export function parseSocketMessage(raw: unknown): WSMessage | null {
  if (typeof raw !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("type" in parsed) ||
    typeof (parsed as { type?: unknown }).type !== "string"
  ) {
    return null;
  }

  return parsed as WSMessage;
}

export function isTimeSyncMessage(message: WSMessage): message is WSMessage & TimeSyncMessage {
  return message.type === "send-time-sync";
}

export function getTimeSyncOffsets(args: {
  message: TimeSyncMessage;
  clientRecvAt: number;
  clientRecvPerf: number;
}) {
  const clientSentAt = Number(args.message.clientSentAt || 0);
  const clientSentPerf = Number(args.message.clientSentPerf || 0);
  const serverNow = Number(args.message.serverNow || 0);

  const hasDateOffset = clientSentAt > 0 && serverNow > 0;
  const hasPerfOffset = clientSentPerf > 0 && serverNow > 0;

  return {
    offsetMs: hasDateOffset ? serverNow - (clientSentAt + args.clientRecvAt) / 2 : null,
    offsetPerfMs: hasPerfOffset ? serverNow - (clientSentPerf + args.clientRecvPerf) / 2 : null,
    lastSyncPerf: hasPerfOffset ? args.clientRecvPerf : null,
  };
}
