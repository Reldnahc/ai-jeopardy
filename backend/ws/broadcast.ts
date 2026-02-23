import type { JsonMap, SocketState } from "../types/runtime.js";
import type WebSocket from "ws";

type WsServerLike = { clients: Set<WebSocket> };

export const makeBroadcaster = (wss: WsServerLike) => {
  const broadcast = (gameId: string, payload: JsonMap) => {
    const msg = JSON.stringify(payload);
    for (const rawClient of wss.clients) {
      const client = rawClient as SocketState;
      if (client.readyState !== 1) continue;
      if (client.gameId !== gameId) continue;

      try {
        client.send(msg);
      } catch {
        // ignore
      }
    }
  };

  const broadcastAll = (payload: JsonMap) => {
    const msg = JSON.stringify(payload);
    for (const rawClient of wss.clients) {
      const client = rawClient as SocketState;
      if (client.readyState !== 1) continue;
      try {
        client.send(msg);
      } catch {
        // ignore
      }
    }
  };

  return { broadcast, broadcastAll };
};
