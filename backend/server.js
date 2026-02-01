import { WebSocketServer } from 'ws';
import 'dotenv/config';
import { createCategoryOfTheDay } from './services/aiService.js';
import http from "http";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import { attachWebSocketServer } from "./ws/index.js";
import { getCOTD, setCOTD } from "./state/cotdStore.js";
import { registerHttpRoutes } from "./http/routes.js";
import { monitorEventLoopDelay } from "node:perf_hooks";
const app = express(); // Initialize Express app
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
registerHttpRoutes(app, { distPath });



const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
    const p99 = Math.round(h.percentile(99) / 1e6);
    const mean = Math.round(h.mean / 1e6);

    if (p99 > 200) {
        console.warn("[PERF] event loop lag", { p99ms: p99, meanms: mean });
    }
    h.reset();
}, 2000).unref();

// --- Startup safety --------------------------------------------------------
// Make sure critical async state (COTD) is ready BEFORE accepting connections.
const PORT = Number( 3002);

async function refreshCOTD() {
    try {
        const next = await createCategoryOfTheDay();
        setCOTD(next);
        return next;
    } catch (err) {
        console.error("[COTD] Failed to refresh Category Of The Day:", err);
        // Keep the previous COTD so the server can still run.
        return getCOTD();
    }
}

async function bootstrap() {
    await refreshCOTD();

    // Wire up WS handlers before listening.
    attachWebSocketServer(wss);

    server.listen(PORT, () => {
        console.log(`HTTP + WS listening on :${PORT}`);
    });

    // Refresh hourly (best-effort; errors are logged and previous COTD is kept).
    setInterval(() => {
        refreshCOTD().catch(() => {});
    }, 1000 * 60 * 60);
}

bootstrap().catch((err) => {
    console.error("Server bootstrap failed:", err);
    process.exit(1);
});