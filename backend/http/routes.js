// backend/http/routes.js
import path from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { supabase } from "../config/database.js";
import { r2 } from "../services/r2Client.js";


// --- TTS asset lookup protection (prevents Supabase stampede) ---
const TTS_CACHE_TTL_MS = 5 * 60 * 1000;

const ttsMetaCache = new Map(); // assetId -> { storageKey, contentType, expiresAt }
const ttsInFlight = new Map();  // assetId -> Promise<{ storageKey, contentType }>

function getCachedTtsMeta(assetId) {
    const hit = ttsMetaCache.get(assetId);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        ttsMetaCache.delete(assetId);
        return null;
    }
    return hit;
}

function setCachedTtsMeta(assetId, storageKey, contentType) {
    ttsMetaCache.set(assetId, {
        storageKey,
        contentType,
        expiresAt: Date.now() + TTS_CACHE_TTL_MS,
    });
}

function isConnectTimeoutError(err) {
    const msg = String(err?.message || "");
    const details = String(err?.details || "");
    return (
        msg.includes("fetch failed") ||
        msg.includes("UND_ERR_CONNECT_TIMEOUT") ||
        details.includes("UND_ERR_CONNECT_TIMEOUT")
    );
}

/**
 * Registers all Express HTTP routes (GET endpoints + SPA fallback).
 * @param {import("express").Express} app
 * @param {{ distPath: string }} deps
 */
export function registerHttpRoutes(app, { distPath }) {
    // --- Images --------------------------------------------------------------

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
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

            obj.Body.pipe(res);
        } catch (e) {
            console.error("GET /api/images/:assetId failed:", e);
            res.status(500).json({ error: "Failed to load image" });
        }
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

    // --- TTS -----------------------------------------------------------------

    app.get("/api/tts/:assetId", async (req, res) => {
        const { assetId } = req.params;

        try {
            const { data, error } = await supabase
                .from("tts_assets")
                .select("storage_key, content_type")
                .eq("id", assetId)
                .single();

            // If Supabase query itself failed (network issues etc.)
            if (error) {
                console.error("Supabase error in /api/tts:", error);
                res.setHeader("Cache-Control", "no-store");
                return res.status(503).json({ error: "TTS lookup unavailable" });
            }

            // If row not found, keep 404 (optional: treat as 202 for a short window if you want)
            if (!data) {
                return res.status(404).json({ error: "TTS asset not found" });
            }

            // ✅ Pending: row exists but storage key not yet set
            if (!data.storage_key || !String(data.storage_key).trim()) {
                res.setHeader("Cache-Control", "no-store");
                res.setHeader("Retry-After", "0.25");
                return res.status(202).json({ status: "pending" });
            }

            const storageKey = data.storage_key;
            const contentType = data.content_type || "audio/mpeg";

            try {
                const cmd = new GetObjectCommand({
                    Bucket: process.env.R2_BUCKET,
                    Key: storageKey,
                });

                const obj = await r2.send(cmd);

                res.setHeader("Content-Type", contentType);
                res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
                return obj.Body.pipe(res);
            } catch (e) {
                // ✅ Pending: storage_key exists, but object not available yet
                // This is the race you described.
                const msg = String(e?.name || "") + " " + String(e?.message || "");
                const isNotYetThere =
                    msg.includes("NoSuchKey") ||
                    msg.includes("NotFound") ||
                    msg.includes("404");

                if (isNotYetThere) {
                    res.setHeader("Cache-Control", "no-store");
                    res.setHeader("Retry-After", "0.25");
                    return res.status(202).json({ status: "pending" });
                }

                console.error("R2 error in /api/tts:", e);
                res.setHeader("Cache-Control", "no-store");
                return res.status(500).json({ error: "TTS fetch failed" });
            }
        } catch (e) {
            console.error("GET /api/tts/:assetId failed:", e);
            res.setHeader("Cache-Control", "no-store");
            return res.status(500).json({ error: "TTS endpoint failed" });
        }
    });

    app.get("/api/tts-assets/:assetId", async (req, res) => {
        const { assetId } = req.params;
        // 1) Cache hit
        const cached = getCachedTtsMeta(assetId);
        let storageKey;
        let contentType;

        if (cached) {
            storageKey = cached.storageKey;
            contentType = cached.contentType || "audio/mpeg";
        } else {
            // 2) In-flight dedupe (if 20 clients ask for same id, only 1 Supabase call)
            let p = ttsInFlight.get(assetId);

            if (!p) {
                p = (async () => {
                    const { data, error } = await supabase
                        .from("tts_assets")
                        .select("storage_key, content_type")
                        .eq("id", assetId)
                        .single();

                    if (error) {
                        // If this is a connectivity failure, surface 503 (don’t cache)
                        if (isConnectTimeoutError(error)) throw error;

                        const code = error.code || "";
                        const status = error.status || 0;
                        const isNotFound =
                            code === "PGRST116" || status === 406 || /0 rows/i.test(error.message || "");

                        if (isNotFound) {
                            const e = new Error("TTS_NOT_FOUND");
                            e.code = "TTS_NOT_FOUND";
                            throw e;
                        }

                        throw error;
                    }

                    if (!data) {
                        const e = new Error("TTS_NOT_FOUND");
                        e.code = "TTS_NOT_FOUND";
                        throw e;
                    }

                    return {
                        storageKey: data.storage_key,
                        contentType: data.content_type || "audio/mpeg",
                    };
                })();

                ttsInFlight.set(assetId, p);
            }

            try {
                const meta = await p;
                storageKey = meta.storageKey;
                contentType = meta.contentType || "audio/mpeg";
                setCachedTtsMeta(assetId, storageKey, contentType);
            } catch (e) {
                // IMPORTANT: clear in-flight on failure so future calls can retry
                ttsInFlight.delete(assetId);

                if (e?.code === "TTS_NOT_FOUND") {
                    return res.status(404).json({ error: "TTS asset not found" });
                }

                if (isConnectTimeoutError(e)) {
                    // Don’t let clients cache this failure
                    res.setHeader("Cache-Control", "no-store");
                    return res.status(503).json({ error: "TTS lookup temporarily unavailable" });
                }

                console.error("Supabase error in /api/tts:", e);
                return res.status(500).json({ error: "TTS lookup failed" });
            } finally {
                // On success, remove in-flight (cache now holds it)
                ttsInFlight.delete(assetId);
            }
        }
    });

    app.get("/test/tts/:assetId", async (req, res) => {
        const { assetId } = req.params;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>TTS Test</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 24px; }
            code { background: #f3f3f3; padding: 2px 6px; border-radius: 6px; }
          </style>
        </head>
        <body>
          <h2>R2 TTS Serve Test</h2>
          <p>assetId: <code>${assetId}</code></p>
          <p>URL: <code>/api/tts/${assetId}</code></p>
          <audio controls src="/api/tts/${assetId}"></audio>
        </body>
      </html>
    `);
    });

    // --- SPA fallback --------------------------------------------------------

    app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
    });
}
