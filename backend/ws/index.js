import { createWsContext } from "./context.js";
import { routeWsMessage } from "./router.js";

export const attachWebSocketServer = (wss) => {
    const ctx = createWsContext(wss);

    wss.on("connection", (ws) => {
        ws.isAlive = true;

        ws.on("pong", () => {
            ws.isAlive = true;
        });

        ws.on("message", async (raw) => {
            try {
                const handled = await routeWsMessage(ws, raw, ctx);
                if (!handled) {
                    // optional: log unknown types
                    // console.log("[WS] Unhandled message:", raw?.toString?.() ?? raw);
                }
            } catch (e) {
                console.error("[WS] handler error:", e);
            }
        });

        ws.on("close", () => {
            // your existing disconnect logic goes here OR move it to a ctx helper
            // typically: mark player offline, broadcast updates, schedule cleanup
        });
    });

    return ctx;
};
