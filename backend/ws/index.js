// backend/ws/index.js
import { createWsContext } from "./context.js";
import { routeWsMessage } from "./router.js";
import { handleSocketClose } from "./lifecycle.js";

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

        // ✅ Step 1: attach RTT state (app-level ping/pong)
        ws.rtt = {
            lastRttMs: null,
            lastPongAt: null,
            lastPingSentAt: null,
        };

        // backend/ws/index.js

        // Send app-level RTT pings every 2s
        const RTT_INTERVAL_MS = 2000;

        ws._rttInterval = setInterval(() => {
            if (ws.readyState !== ws.OPEN) return;

            const t = Date.now();
            ws.rtt.lastPingSentAt = t;

            try {
                ws.send(
                    JSON.stringify({
                        type: "rtt-ping",
                        t,
                    })
                );
            } catch {
                // ignore send errors
            }
        }, RTT_INTERVAL_MS);

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

            // ✅ Step 1: intercept app-level rtt pong messages BEFORE routing
            if (data?.type === "rtt-pong" && typeof data.t === "number") {
                const rtt = Date.now() - data.t;
                ws.rtt.lastRttMs = rtt;
                ws.rtt.lastPongAt = Date.now();

                // Tune these thresholds however you want
                if (rtt >= 2000) {
                    console.warn("[WS:RTT] VERY HIGH", {
                        socketId: ws.id,
                        gameId: ws.gameId,
                        rttMs: rtt,
                    });
                } else if (rtt >= 500) {
                    console.warn("[WS:RTT] HIGH", {
                        socketId: ws.id,
                        gameId: ws.gameId,
                        rttMs: rtt,
                    });
                } else {
                    // comment this out if it’s too noisy
                    console.log("[WS:RTT]", {
                        socketId: ws.id,
                        gameId: ws.gameId,
                        rttMs: rtt,
                    });
                }

                return; // don't pass to router
            }

            // Your existing inbound logging
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
                // IMPORTANT: keep passing what your router expects
                await routeWsMessage(ws, raw, ctx);
            } catch (e) {
                console.error("[WS] handler error:", e);
            }
        });

        ws.on("close", () => handleSocketClose(ws, ctx));
    });

    return ctx;
};
