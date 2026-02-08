// backend/ws/index.ts
import { createWsContext } from "./context.ts";
import { routeWsMessage } from "./router.js";
import { handleSocketClose } from "./lifecycle.js";

export const attachWebSocketServer = (wss, repos) => {
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

        ws.on("message", async (raw) => {
            // raw is usually a Buffer
            const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);

            // Parse once (so we can intercept rtt-pong AND reuse for logging)
            let data = null;
            try {
                data = JSON.parse(text);
            } catch {
                // ignore parse; router may handle other formats if any
            }
            if (data) {
                console.log("[WS:IN]", {
                    socketId: ws.id,
                    gameId: ws.gameId,
                    type: data?.type,
                    payload: data,
                });
            } else {
                console.log("[WS:IN]", {
                    socketId: ws.id,
                    gameId: ws.gameId,
                    raw: text,
                });
            }

            try {
                await routeWsMessage(ws, raw, ctx);
            } catch (e) {
                console.error("[WS] handler error:", e);
            }
        });

        const interval = setInterval(() => {
            wss.clients.forEach((ws) => {
                if (ws.isAlive === false) return ws.terminate();
                ws.isAlive = false;
                ws.ping();
            });
        }, 25_000);

        ws.on("close", () => handleSocketClose(ws, ctx, interval));
    });

    return ctx;
};
