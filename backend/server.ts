// backend/server.ts
import { WebSocketServer } from "ws";
import "dotenv/config";

import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { join } from "node:path";


import { Agent, setGlobalDispatcher } from "undici";

import { createCategoryOfTheDay } from "./services/aiService.js";

import { attachWebSocketServer } from "./ws/index.js";
import { getCOTD, setCOTD } from "./state/cotdStore.js";
import { registerHttpRoutes } from "./http/routes.js";
import { registerAuthRoutes } from "./http/authRoutes.js";
import { registerProfileRoutes } from "./http/profileRoutes.js";
import { registerBoardRoutes } from "./http/boardRoutes.js";
import { pool } from "./config/pg.js";
import { createRepos } from "./repositories/index.js";


const app = express();

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(bodyParser.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const distPath = join(process.cwd(), "dist");
// --- 1. REGISTER API ROUTES FIRST ---
const repos = createRepos(pool);

registerAuthRoutes(app, repos);
registerProfileRoutes(app, repos);
registerBoardRoutes(app, repos);

// --- 2. SERVE STATIC ASSETS ---
app.use(express.static(distPath));

// --- 3. FRONTEND CATCH-ALL LAST ---
registerHttpRoutes(app, distPath, repos);

// --- External Service Config ---
setGlobalDispatcher(
    new Agent({
        keepAliveTimeout: 60_000,
        keepAliveMaxTimeout: 60_000,
        connectTimeout: 10_000,
        headersTimeout: 30_000,
        bodyTimeout: 30_000,
    })
);

const PORT = 3002;

async function refreshCOTD() {
    try {
        const next = await createCategoryOfTheDay();
        setCOTD(next);
        return next;
    } catch (err) {
        console.error("[COTD] Failed to refresh Category Of The Day:", err);
        return getCOTD();
    }
}

async function bootstrap() {
    await refreshCOTD();
    attachWebSocketServer(wss, repos);

    server.listen(PORT, () => {
        console.log(`HTTP + WS listening on :${PORT}`);
    });

    setInterval(() => {
        void refreshCOTD();
    }, 1000 * 60 * 60);
}

bootstrap().catch((err) => {
    console.error("Server bootstrap failed:", err);
    process.exit(1);
});
