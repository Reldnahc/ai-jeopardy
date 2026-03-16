import type { SocketState } from "../types/runtime.js";

type SendLobbySnapshot = (ws: SocketState, gameId: string) => void;

export function sendSocketError(
  ws: SocketState,
  message: string,
  extra: Record<string, unknown> = {},
): void {
  ws.send(JSON.stringify({ type: "error", message, ...extra }));
}

export function sendLobbyErrorAndSnapshot({
  ws,
  gameId,
  sendLobbySnapshot,
  message,
  extra,
}: {
  ws: SocketState;
  gameId: string;
  sendLobbySnapshot: SendLobbySnapshot;
  message: string;
  extra?: Record<string, unknown>;
}): void {
  sendSocketError(ws, message, extra);
  sendLobbySnapshot(ws, gameId);
}
