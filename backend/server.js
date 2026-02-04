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
import { registerAuthRoutes } from "./http/authRoutes.js";
import { registerProfileRoutes } from "./http/profileRoutes.js";

const app = express();
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization"],
}));
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "..", "dist");

// --- 1. REGISTER API ROUTES FIRST ---
// We do this before static files so /api/... requests don't hit the static middle-ware
registerAuthRoutes(app);
registerProfileRoutes(app);

// --- 2. SERVE STATIC ASSETS ---
// This handles JS, CSS, and Images
app.use(express.static(distPath));

// --- 3. FRONTEND CATCH-ALL LAST ---
// This handles React Router paths by serving index.html
registerHttpRoutes(app, { distPath });

// --- External Service Config ---
setGlobalDispatcher(new Agent({
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 60_000,
    connectTimeout: 10_000,
    headersTimeout: 30_000,
    bodyTimeout: 30_000,
}));

const PORT = Number(3002);

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
    attachWebSocketServer(wss);

    server.listen(PORT, () => {
        console.log(`HTTP + WS listening on :${PORT}`);
    });

    setInterval(() => {
        refreshCOTD().catch(() => {});
    }, 1000 * 60 * 60);
}

bootstrap().catch((err) => {
    console.error("Server bootstrap failed:", err);
    process.exit(1);
});