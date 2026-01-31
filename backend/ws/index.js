import { createWsContext } from "./context.js";
import { routeWsMessage } from "./router.js";
import {handleSocketClose} from "./lifecycle.js";

export const attachWebSocketServer = (wss) => {
    const ctx = createWsContext(wss);

    wss.on("connection", (ws) => {
        ws.id = crypto.randomUUID();
        ws.isAlive = true;
        ws.auth = {
            isAuthed: false,
            userId: null,
            role: "default",
        };

        ws.on("pong", () => {
            ws.isAlive = true;
        });

        ws.on("message", async (raw) => {
            // raw is usually a Buffer
            const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);

            // Log without breaking the router contract
            try {
                const data = JSON.parse(text);
                // console.log("[WS:IN]", {
                //     socketId: ws.id,
                //     gameId: ws.gameId,
                //     type: data?.type,
                //     payload: data,
                // });
            } catch {
                console.log("[WS:IN]", {
                    socketId: ws.id,
                    gameId: ws.gameId,
                    raw: text,
                });
            }

            try {
                // IMPORTANT: keep passing what your router expects
                await routeWsMessage(ws, raw, ctx);
                // If your router expects string instead of Buffer, use: await routeWsMessage(ws, text, ctx);
            } catch (e) {
                console.error("[WS] handler error:", e);
            }
        });


        ws.on("close", () => handleSocketClose(ws, ctx));
    });

    return ctx;
};