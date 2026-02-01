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
import { Agent, setGlobalDispatcher } from "undici";

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

setGlobalDispatcher(new Agent({
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 60_000,
    connectTimeout: 10_000,
    headersTimeout: 30_000,
    bodyTimeout: 30_000,
}));

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