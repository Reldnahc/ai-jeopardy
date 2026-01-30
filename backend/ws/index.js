import { createWsContext } from "./context.js";
import { routeWsMessage } from "./router.js";
import {handleSocketClose} from "./lifecycle.js";

export const attachWebSocketServer = (wss) => {
    const ctx = createWsContext(wss);

    wss.on("connection", (ws) => {
        ws.id = crypto.randomUUID();
        ws.isAlive = true;

        ws.on("pong", () => {
            ws.isAlive = true;
        });

        ws.on("message", async (raw) => {
            try {
                await routeWsMessage(ws, raw, ctx);
            } catch (e) {
                console.error("[WS] handler error:", e);
            }
        });

        ws.on("close", () => handleSocketClose(ws, ctx));
    });

    return ctx;
};