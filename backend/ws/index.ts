// backend/ws/index.ts
import { createWsContext } from "./context.js";
import { routeWsMessage } from "./router.js";
import { handleSocketClose } from "./lifecycle.js";
import type { SocketState } from "../types/runtime.js";
import type WebSocket from "ws";

type WsServerLike = {
  clients: Set<WebSocket>;
  on(event: "connection", listener: (ws: SocketState) => void): void;
};

export const attachWebSocketServer = (wss: WsServerLike, repos: Record<string, unknown>) => {
  const ctx = createWsContext(wss, repos);

  wss.on("connection", (ws) => {
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
      // raw is usually a Buffer
      const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);

      // Parse once (so we can intercept rtt-pong AND reuse for logging)
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        // ignore parse; router may handle other formats if any
      }
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
