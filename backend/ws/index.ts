// backend/ws/index.ts
import { createWsContext } from "./context.js";
import { routeWsMessage } from "./router.js";
import { handleSocketClose } from "./lifecycle.js";
import type { SocketState } from "../types/runtime.js";
import type { Repos } from "../repositories/index.js";
import type WebSocket from "ws";

type WsServerLike = {
  clients: Set<WebSocket>;
  on(event: "connection", listener: (ws: SocketState) => void): void;
};

export const attachWebSocketServer = (wss: WsServerLike, repos: Repos) => {
  const ctx = createWsContext(wss, repos);

  wss.on("connection", (ws: SocketState) => {
    ws.id = crypto.randomUUID();
    ws.isAlive = true;

    ws.auth = {
      isAuthed: false,
      userId: null,
      role: "default",
    };

    // Low-level ws ping/pong (keepalive) still fine to keep
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (raw: Buffer | string) => {
      // if (data) {
      //     console.log("[WS:IN]", {
      //         socketId: ws.id,
      //         gameId: ws.gameId,
      //         type: data?.type,
      //         payload: data,
      //     });
      // } else {
      //     console.log("[WS:IN]", {
      //         socketId: ws.id,
      //         gameId: ws.gameId,
      //         raw: text,
      //     });
      // }

      try {
        await routeWsMessage(ws, raw, ctx);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        ws.send(JSON.stringify({ type: "error", code: "server_error", message }));
      }
    });

    const interval = setInterval(() => {
      wss.clients.forEach((client: WebSocket) => {
        const socket = client as SocketState;
        if (socket.isAlive === false) return socket.terminate();
        socket.isAlive = false;
        socket.ping();
      });
    }, 20_000);

    ws.on("close", () => handleSocketClose(ws, ctx, interval));
  });

  return ctx;
};
