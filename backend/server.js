import { WebSocketServer } from 'ws';
import 'dotenv/config';
import { createCategoryOfTheDay } from './services/aiService.js';
import http from "http";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { supabase } from "./config/database.js";
import path from "path";
import { fileURLToPath } from "url";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "./services/r2Client.js";
import { attachWebSocketServer } from "./ws/index.js";
import { getCOTD, setCOTD } from "./state/cotdStore.js";

const app = express(); // Initialize Express app
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

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
    // Ensure COTD exists before we accept connections.
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
// --------------------------------------------------------------------------

app.get("/api/images/:assetId", async (req, res) => {
    try {
        const { assetId } = req.params;

        const { data, error } = await supabase
            .from("image_assets")
            .select("storage_key, content_type")
            .eq("id", assetId)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: "Image asset not found" });
        }

        const storageKey = data.storage_key;
        const contentType = data.content_type || "image/webp";

        const cmd = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: storageKey,
        });

        const obj = await r2.send(cmd);

        res.setHeader("Content-Type", contentType);
        // cache hard; if you ever change an image, it should get a new sha256/key anyway
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

        // obj.Body is a stream
        obj.Body.pipe(res);
    } catch (e) {
        console.error("GET /api/images/:assetId failed:", e);
        res.status(500).json({ error: "Failed to load image" });
    }
});

app.get("/test/image/:assetId", async (req, res) => {
    const { assetId } = req.params;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Image Test</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 24px; }
          img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px; }
          code { background: #f3f3f3; padding: 2px 6px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <h2>R2 Image Serve Test</h2>
        <p>assetId: <code>${assetId}</code></p>
        <p>URL: <code>/api/images/${assetId}</code></p>
        <img src="/api/images/${assetId}" alt="test image" />
      </body>
    </html>
  `);
});

app.get("/api/image-assets/:assetId", async (req, res) => {
    const { assetId } = req.params;

    const { data, error } = await supabase
        .from("image_assets")
        .select("*")
        .eq("id", assetId)
        .single();

    if (error || !data) return res.status(404).json({ error: "Not found" });
    res.json(data);
});

// SPA fallback
app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
});
